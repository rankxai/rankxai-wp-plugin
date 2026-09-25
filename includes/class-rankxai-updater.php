<?php
/**
 * Update notices for copies installed from GitHub or a RankX AI download.
 *
 * WordPress asks the plugin named in the `Update URI` header for updates, through
 * the `update_plugins_{hostname}` filter. This answers it from the latest GitHub
 * release. The WordPress.org build ships without this file and without the
 * header, because the directory delivers its own updates.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Update checks against the plugin's GitHub releases.
 */
class RankXAI_Updater {

	/** The `Update URI` header value this class answers for. */
	const UPDATE_URI = 'https://github.com/rankxai/rankxai-wp-plugin';

	/** Release metadata, attached to every release as an asset. */
	const MANIFEST_URL = 'https://github.com/rankxai/rankxai-wp-plugin/releases/latest/download/rankxai-update.json';

	/** Release downloads. The package address is built here, never read from the manifest. */
	const DOWNLOAD_BASE = 'https://github.com/rankxai/rankxai-wp-plugin/releases/download/';

	/** The folder the release archive unpacks into. */
	const SLUG = 'rankxai';

	/** Site transient holding the last check. */
	const CACHE_KEY = 'rankxai_release';

	/** How long a successful check is reused. */
	const CACHE_TTL = 6 * HOUR_IN_SECONDS;

	/** How long a failed check is reused, so an outage costs one request an hour. */
	const FAILURE_TTL = HOUR_IN_SECONDS;

	/**
	 * Register the hooks.
	 */
	public static function init() {
		add_filter( 'update_plugins_github.com', array( __CLASS__, 'filter_update' ), 10, 3 );
		add_filter( 'plugins_api', array( __CLASS__, 'filter_plugin_information' ), 10, 3 );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'row_meta' ), 10, 2 );
		add_action( 'admin_post_' . self::CHECK_ACTION, array( __CLASS__, 'handle_check' ) );
		add_action( 'admin_notices', array( __CLASS__, 'check_notice' ) );
		add_action( 'network_admin_notices', array( __CLASS__, 'check_notice' ) );
	}

	/** The admin-post action behind the "Check for updates" link. */
	const CHECK_ACTION = 'rankxai_check_updates';

	/** Query argument carrying the result back to the Plugins screen. */
	const CHECK_RESULT_ARG = 'rankxai-update-check';

	/**
	 * Add "Check for updates" to this plugin's row on the Plugins screen.
	 *
	 * @param string[] $links Row meta links.
	 * @param string   $file  Plugin path relative to the plugins directory.
	 * @return string[]
	 */
	public static function row_meta( $links, $file ) {
		if ( plugin_basename( RANKXAI_PLUGIN_FILE ) !== $file || ! current_user_can( 'update_plugins' ) ) {
			return $links;
		}
		$url     = wp_nonce_url( admin_url( 'admin-post.php?action=' . self::CHECK_ACTION ), self::CHECK_ACTION );
		$links[] = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Check for updates', 'rankxai' ) . '</a>';
		return $links;
	}

	/**
	 * Forget both cached answers and ask again.
	 *
	 * @return string One of 'available', 'current' or 'failed'.
	 */
	public static function run_check() {
		delete_site_transient( self::CACHE_KEY );
		delete_site_transient( 'update_plugins' );
		wp_update_plugins();

		$release = self::latest_release();
		if ( null === $release ) {
			return 'failed';
		}
		return version_compare( $release['version'], RANKXAI_VERSION, '>' ) ? 'available' : 'current';
	}

	/**
	 * Handle the link: check, then return to the page it was clicked on.
	 */
	public static function handle_check() {
		if ( ! current_user_can( 'update_plugins' ) ) {
			wp_die( esc_html__( 'You are not allowed to update plugins.', 'rankxai' ), 403 );
		}
		check_admin_referer( self::CHECK_ACTION );

		$result = self::run_check();
		$back   = wp_get_referer();
		if ( ! $back ) {
			$back = self_admin_url( 'plugins.php' );
		}
		wp_safe_redirect( add_query_arg( self::CHECK_RESULT_ARG, $result, remove_query_arg( self::CHECK_RESULT_ARG, $back ) ) );
		exit;
	}

	/**
	 * Say what the check found, once, on the page the link returned to.
	 */
	public static function check_notice() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only: it only picks a message.
		$result = isset( $_GET[ self::CHECK_RESULT_ARG ] ) ? sanitize_key( wp_unslash( $_GET[ self::CHECK_RESULT_ARG ] ) ) : '';
		if ( '' === $result || ! current_user_can( 'update_plugins' ) ) {
			return;
		}

		$release = self::latest_release();
		if ( 'available' === $result && null !== $release ) {
			$type    = 'warning';
			$message = sprintf(
				/* translators: %s: version number. */
				__( 'RankX AI %s is available. Update it from this screen or from Dashboard → Updates.', 'rankxai' ),
				$release['version']
			);
		} elseif ( 'current' === $result ) {
			$type    = 'success';
			$message = sprintf(
				/* translators: %s: version number. */
				__( 'RankX AI is up to date (version %s).', 'rankxai' ),
				RANKXAI_VERSION
			);
		} elseif ( 'failed' === $result ) {
			$type    = 'error';
			$message = __( 'Could not reach GitHub to check for RankX AI updates. Try again in a few minutes.', 'rankxai' );
		} else {
			return;
		}

		printf( '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>', esc_attr( $type ), esc_html( $message ) );
	}

	/**
	 * Answer WordPress's update check for this plugin only.
	 *
	 * Every plugin whose `Update URI` is on github.com fires this filter, so any
	 * other plugin's value is returned untouched.
	 *
	 * @param array|false $update      Update data from an earlier callback, or false.
	 * @param array       $plugin_data Plugin headers.
	 * @param string      $plugin_file Plugin path relative to the plugins directory.
	 * @return array|false
	 */
	public static function filter_update( $update, $plugin_data, $plugin_file ) {
		if ( plugin_basename( RANKXAI_PLUGIN_FILE ) !== $plugin_file ) {
			return $update;
		}
		if ( ! isset( $plugin_data['UpdateURI'] ) || self::UPDATE_URI !== untrailingslashit( $plugin_data['UpdateURI'] ) ) {
			return $update;
		}

		$release = self::latest_release();
		if ( null === $release ) {
			return $update;
		}

		$answer = array(
			'slug'         => self::SLUG,
			'version'      => $release['version'],
			'url'          => self::UPDATE_URI . '/releases/tag/v' . $release['version'],
			'requires'     => $release['requires'],
			'requires_php' => $release['requires_php'],
			'tested'       => self::tested_for_site( $release['tested'] ),
			'icons'        => self::icons(),
		);

		// Only a copy in `rankxai/` can take the package: the archive unpacks there,
		// and a copy elsewhere would be replaced by a second, inactive one.
		if ( self::installed_in_expected_folder() ) {
			$answer['package'] = self::package_url( $release['version'] );
		}

		return $answer;
	}

	/**
	 * Fill the "View details" window, which otherwise asks WordPress.org.
	 *
	 * @param false|object|array $result The result so far.
	 * @param string             $action The plugins_api action.
	 * @param object             $args   Request arguments.
	 * @return false|object|array
	 */
	public static function filter_plugin_information( $result, $action, $args ) {
		if ( 'plugin_information' !== $action || ! is_object( $args ) || ! isset( $args->slug ) || self::SLUG !== $args->slug ) {
			return $result;
		}

		$release = self::latest_release();
		if ( null === $release ) {
			return $result;
		}

		$changelog = '';
		foreach ( $release['changelog'] as $line ) {
			$changelog .= '<li>' . esc_html( $line ) . '</li>';
		}

		return (object) array(
			'name'          => 'RankX AI',
			'slug'          => self::SLUG,
			'version'       => $release['version'],
			'author'        => '<a href="https://rankxai.com">RankX AI</a>',
			'homepage'      => self::UPDATE_URI,
			'requires'      => $release['requires'],
			'requires_php'  => $release['requires_php'],
			'tested'        => self::tested_for_site( $release['tested'] ),
			'last_updated'  => $release['released'],
			'download_link' => self::installed_in_expected_folder() ? self::package_url( $release['version'] ) : '',
			'sections'      => array(
				'changelog' => '' === $changelog
					? '<p>' . esc_html__( 'See the release notes on GitHub.', 'rankxai' ) . '</p>'
					: '<h4>' . esc_html( $release['version'] ) . '</h4><ul>' . $changelog . '</ul>',
			),
		);
	}

	/**
	 * The latest release, from cache or from GitHub. Null when it cannot be read.
	 *
	 * @return array|null
	 */
	public static function latest_release() {
		$cached = get_site_transient( self::CACHE_KEY );
		if ( is_array( $cached ) && array_key_exists( 'release', $cached ) && ! self::is_forced_check() ) {
			return $cached['release'];
		}

		$release = self::fetch_release();
		set_site_transient(
			self::CACHE_KEY,
			array( 'release' => $release ),
			null === $release ? self::FAILURE_TTL : self::CACHE_TTL
		);
		return $release;
	}

	/**
	 * Read and validate the manifest.
	 *
	 * The request carries no site address: the user agent is fixed.
	 *
	 * @return array|null
	 */
	private static function fetch_release() {
		$response = wp_safe_remote_get(
			self::MANIFEST_URL,
			array(
				'timeout'             => 10,
				'redirection'         => 5,
				'user-agent'          => 'RankX-AI-WordPress-plugin',
				'limit_response_size' => 65536,
				'headers'             => array( 'Accept' => 'application/json, application/octet-stream' ),
			)
		);
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}

		return self::parse_manifest( wp_remote_retrieve_body( $response ) );
	}

	/**
	 * Validate manifest JSON. Anything malformed is treated as no answer.
	 *
	 * @param string $body Raw JSON.
	 * @return array|null
	 */
	public static function parse_manifest( $body ) {
		$data = json_decode( (string) $body, true );
		if ( ! is_array( $data ) || ! isset( $data['version'] ) || ! is_string( $data['version'] ) ) {
			return null;
		}
		if ( ! preg_match( '/^\d+\.\d+\.\d+$/', $data['version'] ) ) {
			return null;
		}

		$changelog = array();
		if ( isset( $data['changelog'] ) && is_array( $data['changelog'] ) ) {
			foreach ( array_slice( $data['changelog'], 0, 30 ) as $line ) {
				if ( is_string( $line ) && '' !== trim( $line ) ) {
					$changelog[] = substr( trim( $line ), 0, 500 );
				}
			}
		}

		return array(
			'version'      => $data['version'],
			'requires'     => self::version_field( $data, 'requires' ),
			'requires_php' => self::version_field( $data, 'requires_php' ),
			'tested'       => self::version_field( $data, 'tested' ),
			'released'     => isset( $data['released'] ) && is_string( $data['released'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $data['released'] ) ? $data['released'] : '',
			'changelog'    => $changelog,
		);
	}

	/**
	 * A dotted version number from the manifest, or '' when absent or malformed.
	 *
	 * @param array  $data Manifest.
	 * @param string $key  Field name.
	 * @return string
	 */
	private static function version_field( $data, $key ) {
		if ( isset( $data[ $key ] ) && is_string( $data[ $key ] ) && preg_match( '/^\d+(\.\d+){0,2}$/', $data[ $key ] ) ) {
			return $data[ $key ];
		}
		return '';
	}

	/**
	 * The plugin's icon for the Updates screen, served from this copy of the plugin
	 * so the screen asks no other site for it.
	 *
	 * @return array<string, string>
	 */
	public static function icons() {
		return array(
			'1x' => plugins_url( 'assets/icon-128x128.png', RANKXAI_PLUGIN_FILE ),
			'2x' => plugins_url( 'assets/icon-256x256.png', RANKXAI_PLUGIN_FILE ),
		);
	}

	/**
	 * "Tested up to 7.1" covers every 7.1.x release, as it does for directory plugins.
	 *
	 * WordPress compares the site's full version with this value, so a bare 7.1 marks
	 * a 7.1.2 site as untested. Inside the tested branch the site's own version is
	 * returned; a newer branch keeps the release's value, and the warning.
	 *
	 * @param string $tested Tested-up-to from the manifest.
	 * @return string
	 */
	public static function tested_for_site( $tested ) {
		if ( '' === $tested ) {
			return $tested;
		}
		$site        = (string) preg_replace( '/[^0-9.].*$/', '', (string) get_bloginfo( 'version' ) );
		$branch      = implode( '.', array_slice( explode( '.', $tested ), 0, 2 ) );
		$site_branch = implode( '.', array_slice( explode( '.', $site ), 0, 2 ) );
		if ( '' !== $site && version_compare( $site_branch, $branch, '<=' ) && version_compare( $site, $tested, '>' ) ) {
			return $site;
		}
		return $tested;
	}

	/**
	 * The archive for a release. Pinned to its tag, so "latest" moving cannot change it.
	 *
	 * @param string $version A validated version.
	 * @return string
	 */
	public static function package_url( $version ) {
		return self::DOWNLOAD_BASE . 'v' . $version . '/rankxai.zip';
	}

	/**
	 * Is this copy in the folder the release archive unpacks into?
	 *
	 * @return bool
	 */
	public static function installed_in_expected_folder() {
		return self::SLUG === dirname( plugin_basename( RANKXAI_PLUGIN_FILE ) );
	}

	/**
	 * "Check again" on Dashboard → Updates should skip the cache.
	 *
	 * @return bool
	 */
	private static function is_forced_check() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only: it only skips a cache.
		return is_admin() && isset( $_GET['force-check'] ) && current_user_can( 'update_plugins' );
	}
}

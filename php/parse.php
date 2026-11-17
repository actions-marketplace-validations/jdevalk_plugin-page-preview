<?php
/** Run upstream parsing without booting a WordPress site or executing plugin code. */
error_reporting( E_ALL & ~E_DEPRECATED );
ini_set( 'display_errors', 'stderr' );
define( 'ABSPATH', dirname( __DIR__ ) . '/vendor/' );
define( 'WPINC', 'wordpress' );
define( 'WP_DEBUG', false );
define( 'WP_INSTALLING', false );
require ABSPATH . WPINC . '/compat.php';
require ABSPATH . WPINC . '/utf8.php';
require ABSPATH . WPINC . '/plugin.php';
require ABSPATH . WPINC . '/load.php';
require ABSPATH . WPINC . '/functions.php';
require ABSPATH . WPINC . '/formatting.php';
require ABSPATH . WPINC . '/kses.php';
add_filter( 'pre_option_blog_charset', static fn() => 'UTF-8' );
require ABSPATH . 'wordpress-org/class-markdown.php';
require ABSPATH . 'wordpress-org/class-parser.php';
require __DIR__ . '/preflight.php';

class PreviewParser extends \WordPressdotorg\Plugin_Directory\Readme\Parser {
    // Offline preview cannot verify WordPress.org accounts. Preserve supplied handles.
    protected function sanitize_contributors( $users ) {
        return array_values( array_filter( array_map( static fn( $user ) => ltrim( trim( $user ), '@' ), $users ) ) );
    }
    public function parseContents( string $contents ): void {
        // Bypass upstream constructor path/URL detection: input is always text.
        $this->parse_readme_contents( $contents );
    }
}

try {
    $input = json_decode( stream_get_contents( STDIN ), true, 512, JSON_THROW_ON_ERROR );
    if ( ! is_string( $input['readme'] ?? null ) || strlen( $input['readme'] ) > 524288 ) {
        throw new RuntimeException( 'Choose a readme smaller than 512 KB.' );
    }
    $parser = new PreviewParser();
    $parser->parseContents( $input['readme'] );
    // Re-run with no short-description cap to report the count before truncation.
    $uncapped = new PreviewParser();
    $uncapped->maximum_field_lengths['short_description'] = PHP_INT_MAX;
    $uncapped->parseContents( $input['readme'] );
    $data = get_object_vars( $parser );
    unset( $data['raw_contents'] );
    $data['short_description_length'] = mb_strlen( html_entity_decode( $uncapped->short_description, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
    $data['short_description_original'] = $uncapped->short_description;
    // Match the core Plugins list's sanitization (markup=false), without loading a site.
    // See WordPress 6.9 wp-admin/includes/plugin.php::_get_plugin_data_markup_translate.
    if ( ! empty( $input['headers'] ) && is_array( $input['headers'] ) ) {
        $inline = array( 'abbr' => array( 'title' => true ), 'acronym' => array( 'title' => true ), 'code' => true, 'em' => true, 'strong' => true );
        $linked = $inline + array( 'a' => array( 'href' => true, 'title' => true ) );
        $data['admin_headers'] = array();
        foreach ( array( 'Plugin Name', 'Description', 'Version', 'Author', 'Author URI', 'Plugin URI' ) as $field ) {
            $value = $input['headers'][ $field ] ?? '';
            $value = is_string( $value ) ? substr( $value, 0, 8192 ) : '';
            $data['admin_headers'][ $field ] = str_ends_with( $field, ' URI' )
                ? esc_url( $value )
                : wp_kses( $value, 'Plugin Name' === $field ? $inline : $linked );
        }
    }
    $data['preflight_checks'] = preview_objective_checks( $data, is_array( $input['headers'] ?? null ) ? $input['headers'] : array() );
    echo json_encode( $data, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE );
} catch ( Throwable $error ) {
    fwrite( STDERR, $error->getMessage() . "\n" );
    exit( 1 );
}

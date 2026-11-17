<?php
/** Objective checks on upstream parser output and imported PHP headers. */
function preview_version_key( string $value ): string {
    $value = trim( $value );
    // Treat trailing zero components as equivalent, preserving prerelease labels.
    if ( preg_match( '/^(\d+(?:\.\d+)*)(.*)$/', $value, $matches ) ) {
        $parts = explode( '.', $matches[1] );
        while ( count( $parts ) > 1 && '0' === end( $parts ) ) {
            array_pop( $parts );
        }
        return implode( '.', $parts ) . strtolower( $matches[2] );
    }
    return $value;
}

function preview_has_content( string $html ): bool {
    return '' !== trim( html_entity_decode( strip_tags( preg_replace( '/<!--.*?-->/s', '', $html ) ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ), " \t\r\n\0\x0B\xc2\xa0" );
}

function preview_objective_checks( array $parsed, array $headers ): array {
    $checks = array();
    $loaded = ! empty( $headers['Plugin Name'] );
    $version = trim( (string) ( $headers['Version'] ?? '' ) );
    $stable = (string) ( $parsed['stable_tag'] ?? '' );
    if ( ! $stable ) {
        $checks[] = array( 'warn', 'No Stable tag header found.' );
    } else {
        $checks[] = array( 'good', "Stable tag is declared: {$stable}." );
    }
    if ( $loaded && ! $version ) {
        $checks[] = array( 'warn', 'The main PHP file has no Version header.' );
    } elseif ( $loaded ) {
        $checks[] = array( 'good', "The PHP Version header is declared: {$version}." );
    }
    if ( $version && $stable && 'trunk' !== strtolower( $stable ) && preview_version_key( $version ) !== preview_version_key( $stable ) ) {
        $checks[] = array( 'warn', "Stable tag {$stable} differs from plugin version {$version}." );
    } elseif ( $version && $stable && 'trunk' !== strtolower( $stable ) ) {
        $checks[] = array( 'good', "Stable tag matches the PHP Version header: {$version}." );
    }
    foreach ( array( 'Requires at least' => 'requires', 'Requires PHP' => 'requires_php' ) as $label => $field ) {
        $readme_value = (string) ( $parsed[ $field ] ?? '' );
        $php_value = trim( (string) ( $headers[ $label ] ?? '' ) );
        $warning = 'requires' === $field ? 'requires_header_ignored' : 'requires_php_header_ignored';
        if ( $loaded && ! $php_value ) {
            $checks[] = array( 'warn', "The main PHP file has no “{$label}” header. WordPress reads this requirement from the PHP file." );
        } elseif ( ! $loaded && ! $readme_value && empty( $parsed['warnings'][ $warning ] ) ) {
            $checks[] = array( 'warn', "No “{$label}” value found in the readme. Open the plugin folder to check its PHP header." );
        }
        if ( $readme_value ) {
            $checks[] = array( 'good', "The readme “{$label}” value is valid: {$readme_value}." );
        }
        if ( $php_value && preg_match( '/^\d+\.\d+(?:\.\d+)?$/', $php_value ) ) {
            $checks[] = array( 'good', "The PHP “{$label}” header is a numeric version: {$php_value}." );
        }
        if ( $php_value && ! preg_match( '/^\d+\.\d+(?:\.\d+)?$/', $php_value ) ) {
            $checks[] = array( 'warn', "The PHP “{$label}” value “{$php_value}” is not a numeric version." );
        } elseif ( $php_value && $readme_value && preview_version_key( $php_value ) !== preview_version_key( $readme_value ) ) {
            $checks[] = array( 'warn', "“{$label}” differs: PHP header {$php_value}, readme {$readme_value}. WordPress uses the PHP header." );
        } elseif ( $php_value && $readme_value && preg_match( '/^\d+\.\d+(?:\.\d+)?$/', $php_value ) ) {
            $checks[] = array( 'good', "“{$label}” matches between the readme and PHP header: {$php_value}." );
        }
    }
    $minimum = $loaded ? ( $headers['Requires at least'] ?? '' ) : ( $parsed['requires'] ?? '' );
    $tested = $parsed['tested'] ?? '';
    if ( preg_match( '/^\d+\.\d+(?:\.\d+)?$/', $minimum ) && $tested ) {
        // Tested up to is a WordPress major branch, not a maintenance version.
        $minimum_major = implode( '.', array_slice( explode( '.', $minimum ), 0, 2 ) );
        $tested_major = implode( '.', array_slice( explode( '.', $tested ), 0, 2 ) );
        if ( version_compare( $minimum_major, $tested_major, '>' ) ) {
            $checks[] = array( 'warn', "“Tested up to” {$tested} is below the minimum WordPress version {$minimum}." );
        } else {
            $checks[] = array( 'good', "“Tested up to” {$tested} meets the minimum WordPress version {$minimum}." );
        }
    }
    foreach ( array( 'installation' => 'Installation', 'faq' => 'FAQ', 'changelog' => 'Changelog' ) as $section => $label ) {
        if ( ! preview_has_content( $parsed['sections'][ $section ] ?? '' ) ) {
            $checks[] = array( 'warn', "The {$label} section is missing or empty." );
        } else {
            $checks[] = array( 'good', "{$label} content is present." );
        }
    }
    if ( ! array_filter( $parsed['screenshots'] ?? array(), 'preview_has_content' ) ) {
        $checks[] = array( 'warn', 'The Screenshots section is missing or has no captions.' );
    } else {
        $checks[] = array( 'good', 'Screenshot captions are present.' );
    }
    $changelog = $parsed['sections']['changelog'] ?? '';
    if ( preview_has_content( $changelog ) ) {
        preg_match_all( '/<h[1-6]\b[^>]*>(.*?)<\/h[1-6]>/is', $changelog, $headings );
        $latest = null;
        foreach ( $headings[1] as $heading ) {
            $heading = trim( html_entity_decode( strip_tags( $heading ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
            // Accept version headings with optional labels and a trailing release date.
            // Ignore Unreleased / Upcoming headings instead of treating them as releases.
            if ( preg_match( '/^(?:version\s+|v)?(\d+(?:\.\d+)*(?:[-.]?(?:alpha|beta|rc|dev|preview)\d*)?)(?=$|\s+[-–—(])/iu', $heading, $match ) ) {
                $latest = $match[1];
                break;
            }
        }
        if ( null === $latest ) {
            $checks[] = array( 'info', 'No release version heading recognized in the changelog; version consistency could not be checked.' );
        } else {
            foreach ( array( 'Stable tag' => 'trunk' === strtolower( $stable ) ? '' : $stable, 'PHP Version' => $version ) as $label => $expected ) {
                if ( $expected && preview_version_key( $latest ) !== preview_version_key( $expected ) ) {
                    $checks[] = array( 'warn', "The first changelog release is {$latest}, but {$label} is {$expected}." );
                } elseif ( $expected ) {
                    $checks[] = array( 'good', "The first changelog release matches {$label}: {$latest}." );
                }
            }
        }
    }
    return $checks;
}

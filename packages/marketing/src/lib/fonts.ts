interface FontConfig {
	heading: string;
	body: string;
	mono?: string;
}

/**
 * Default fonts used when no `fonts` prop is provided to base-layout.
 * Matches the previously hardcoded fallback URL; kept here so the layout
 * always calls `buildGoogleFontsUrl` rather than maintaining a separate string.
 */
export const DEFAULT_FONTS: FontConfig = {
	heading: "Manrope",
	body: "Manrope",
	mono: "IBM Plex Mono",
};

/**
 * Builds a CSS string that overrides the --font-heading, --font-body, and
 * --font-mono custom properties on :root to match the site's font config.
 *
 * Without this, globals.css hardcodes default font names in the CSS variables
 * while Google Fonts loads the site-specific fonts; causing a mismatch.
 */
export function buildFontCssOverrides(fonts: FontConfig): string {
	const mono = fonts.mono ?? DEFAULT_FONTS.mono;
	return `:root {
  --font-heading: "${fonts.heading}", system-ui, sans-serif;
  --font-body: "${fonts.body}", system-ui, sans-serif;
  --font-mono: "${mono}", ui-monospace, monospace;
}`;
}

/**
 * Builds a Google Fonts CSS URL from a font configuration.
 *
 * Accepts font family names as-is (e.g. "Space Grotesk", "IBM Plex Sans").
 * Spaces are replaced with `+` for the URL. Always appends `display=swap`.
 */
export function buildGoogleFontsUrl(fonts: FontConfig): string {
	const families: string[] = [];

	const encode = (name: string) => name.replace(/ /g, "+");

	families.push(`family=${encode(fonts.heading)}:wght@400;500;600;700`);
	families.push(`family=${encode(fonts.body)}:ital,wght@0,400;0,500;0,600;1,400`);

	if (fonts.mono) {
		families.push(`family=${encode(fonts.mono)}:wght@400;500;700`);
	}

	return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

import { PEBBLEDESK_BRAND_NAME, PEBBLEDESK_LOGO_EMAIL_URL } from "@pebbledesk/shared";

export function buildBrandHeaderHtml() {
	return `<div style="margin:0 0 16px 0"><img src="${PEBBLEDESK_LOGO_EMAIL_URL}" alt="${PEBBLEDESK_BRAND_NAME}" width="32" style="display:block;width:32px;height:auto;margin:0 0 6px 0" /><div style="font-size:20px;font-weight:700;color:#243446;line-height:1.2">${PEBBLEDESK_BRAND_NAME}</div></div>`;
}

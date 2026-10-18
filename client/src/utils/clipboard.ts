/**
 * Copies text to the clipboard, falling back to a temporary textarea +
 * document.execCommand when the async Clipboard API is unavailable. The
 * Clipboard API only exists in secure contexts (HTTPS or localhost), so the
 * fallback is required when the app is served over plain HTTP on a LAN IP.
 */
export async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // fall through to the legacy path
        }
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}

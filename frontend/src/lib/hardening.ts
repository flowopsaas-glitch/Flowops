/**
 * Runtime hardening (Tier 4 — reasonable, non-harmful only).
 *
 * Runs as an import side-effect and MUST be the first import in the entry file
 * so it executes before react-dom registers with the DevTools hook.
 *
 * What it does (production only):
 *  - Neutralises the React DevTools global hook so the component tree/props are
 *    not trivially inspectable. Cosmetic deterrent — NOT a security boundary.
 *  - Prints a self-XSS console warning (the pattern major apps use) that also
 *    states FlowOps's proprietary/anti-clone stance.
 *
 * Deliberately NOT done: heavy obfuscation, disabling DevTools/right-click,
 * anti-debugger traps — these give false security, break our own debugging, and
 * are trivially bypassed. See SECURITY.md.
 */
(function runtimeHardening() {
  try {
    if (typeof window === 'undefined') return;
    const isProd = Boolean((import.meta as any).env?.PROD);
    if (!isProd) return;

    // 1) Neutralise the React DevTools global hook.
    const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook && typeof hook === 'object') {
      try {
        for (const key of Object.keys(hook)) {
          hook[key] = typeof hook[key] === 'function' ? () => {} : null;
        }
        hook.inject = () => {};
      } catch {
        /* ignore */
      }
    }

    // 2) Self-XSS console warning. Accessed via bracket notation so the build's
    //    console.* stripping (pure annotation) does not remove it.
    setTimeout(() => {
      try {
        const log = (console as any)['log']?.bind(console);
        if (!log) return;
        log('%cStop!', 'font-size:22px;font-weight:bold;color:#ef4444');
        log(
          '%cThis console is for developers. Pasting code here can give an attacker full access to your FlowOps account.\n' +
            'FlowOps™ and CLAW™ are trademarks of FlowOps (Pty) Ltd. Unauthorised copying, reverse engineering or scraping is prohibited.',
          'font-size:13px;color:#cbd5e1',
        );
      } catch {
        /* ignore */
      }
    }, 0);
  } catch {
    /* hardening must never break the app */
  }
})();

export {};

(function () {
/******************************************************************
 *  specialEventHandler.js
 *  --------------------------------------------------------------
 *  Registers and runs domain–specific listeners that the generic
 *  DOMListener cannot reliably cover
 *
 *  Usage from DOMListener.js
 *  --------------------------------------------------------------
 *  import(chrome.runtime.getURL('js/specialEventHandler.js'))
 *        .then(mod => mod.init())
 *        .catch(err => console.warn('[specialHandler] load failed', err));
 ******************************************************************/

/* ---------- simple registry ------------------------------------------------ */
const _handlers = [];

/** Register a new handler.
 *  @param {RegExp}   hostPattern  – tested against location.hostname
 *  @param {Function} initFn       – called if the pattern matches        */
function register(hostPattern, initFn) { _handlers.push({hostPattern, initFn}); }

/* ----------  H A N D L E R S  --------------------------------------------- */
register(/(^|\.)google\.[a-z.]+$/, ({
	nodeToHTMLString,
	trimTarget,
	getEventHash,
	getCurrentHTMLSanitized,
	taskId
}) => {

  const BOX = 'textarea[name="q"][role="combobox"]';
  const BTN = 'button[aria-label="Search"][type="submit"]';

  function report(value, originEl) {
	const evHash = getEventHash();

  
	const actionTarget = {
	  type       : 'submit',
	  target     : nodeToHTMLString(originEl),      // full raw HTML
	  targetId   : originEl.id,
	  targetClass: originEl.className,
	  value      : value                            // the user query text
	};
  
	// highlight element just like other flows
	originEl.setAttribute('ota-use-interactive-target', '1');
	actionTarget.target = trimTarget(originEl);     // prettified / trimmed
	// (optional) remove the mark after trimming
	originEl.removeAttribute('ota-use-interactive-target');
  
	const summaryEvent = {
	  taskId         : taskId,
	  eventHash      : evHash,
	  type           : 'submit',
	  actionTimestamp: Date.now(),
	  eventTarget    : actionTarget,
	  allEvents      : {},                          // nothing to diff for a submit
	  pageHTMLContent: getCurrentHTMLSanitized()
	};
  
	/* ---- ship it to the background  ------------------------------------ */
	chrome.runtime.sendMessage({
	  type : 'submit',     // pick any type name you handle in bg.js
	  summaryEvent
	});
  }

  /*  enter key  */
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches(BOX)) {
      report(e.target.value, e.target);
    }
  }, /*capture*/ true);

  /*  blue Search button  */
  document.addEventListener('click', e => {
    const btn = e.target.closest(BTN);
    if (!btn) return;
    const box = document.querySelector(BOX);
    if (box) report(box.value, btn);
  }, true);

  console.debug('[specialHandler] Google search attached');
});

/* -------------------------------------------------------------------------- */
/** Call once from DOMListener.  Attaches every handler that matches
 *  the current hostname.                                                     */
function init (deps) {
  const host = location.hostname;
  _handlers.forEach(({hostPattern, initFn}) => {
    if (hostPattern.test(host)) {
		console.log(hostPattern)
      try { initFn(deps); }
      catch (err) {
        console.error('[specialHandler] failed for', hostPattern, err);
      }
    }
  });
}

  window.SpecialEvents = { init };

})();
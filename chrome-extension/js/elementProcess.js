const DOM_CACHE = {
    boundingRects: new WeakMap(),
    computedStyles: new WeakMap(),
    clearCache: () => {
      DOM_CACHE.boundingRects = new WeakMap();
      DOM_CACHE.computedStyles = new WeakMap();
    }
  };

const OTA_INPUT_ELEMENT_UNIQUE_ID_PREFIX = "ota-input-field-element-id"
const CREDIT_CARD = /\b\d{13,19}\b/g;            // 13–19 consecutive digits
const SSN         = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g;
const EMAIL       = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi;
let MASK_DATA = false;

const SENSITIVE_FIELD_NAMES = [
	'password','pass','pwd',
	'ssn','social','credit','card','cc',
	'iban','account','routing','balance'
  ];

chrome.storage.sync.get({ maskSensitiveData: false }, ({ maskSensitiveData }) => {
	MASK_DATA = !!maskSensitiveData;
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'sync' && 'maskSensitiveData' in changes) {
		MASK_DATA = !!changes.maskSensitiveData.newValue;
		console.log("[OTA info]: Mask sensitive data: ", MASK_DATA);
	}
});

/**
 * Searches up to maxDepth levels upward and downward from a target node
 * for an interactive element. If an interactive element is found, returns it;
 * otherwise returns the original target.
 * 
 * Priority:
 *   - If the target is already interactive, return it.
 *   - Otherwise, for each depth level from 1 to maxDepth, check:
 *       1. Upward: the d-th parent.
 *       2. Downward: all nodes exactly d levels beneath the target (BFS order).
 *           In downward search, the first found interactive element wins.
 *
 * @param {Node} target - The DOM node that was the original event target.
 * @param {number} [maxDepth=3] - Maximum number of levels to search.
 * @returns {Node} The best-matching interactive element, or the original target.
 */
function findBestInteractiveElement(target, maxDepth = 3) {
	// Define the interactive elements as a set (lowercase for ease of comparing tagName)
	const interactiveElements = new Set([
	  "a", "button", "input", "select", "textarea",
	  "details", "summary", "label", "option", "optgroup", "fieldset", "legend"
	]);
  
	// Helper: Determine if an element is interactive.
	function isInteractive(el) {
	  // Ensure we have an element and a tag name
	  if (!el || !el.tagName) return false;
	  return interactiveElements.has(el.tagName.toLowerCase());
	}
  
	// If the original target is already interactive, no need to search.
	if (isInteractive(target)) {
	  return target;
	}
  
	// For each depth level (from 1 to maxDepth)
	for (let d = 1; d <= maxDepth; d++) {
	  // --- Upward search: go d levels up.
	  let current = target;
	  for (let i = 0; i < d; i++) {
		if (current.parentElement) {
		  current = current.parentElement;
		} else {
		  current = null;
		  break;
		}
	  }
	  if (current && isInteractive(current)) {
		// Priority: parent's result wins at each round.
		return current;
	  }
  
	  // --- Downward search: BFS to nodes exactly d levels below.
	  // We'll use an array as a queue; each item is { node, depth }.
	  let queue = [];
	  // Start with all direct children at depth 1.
	  Array.from(target.children).forEach(child => queue.push({ node: child, depth: 1 }));
  
	  while (queue.length > 0) {
		let { node, depth } = queue.shift();
		if (depth === d && isInteractive(node)) {
		  // Return the first interactive element found at the appropriate depth.
		  return node;
		}
		// Only add children if we haven't reached the target depth.
		if (depth < d) {
		  Array.from(node.children).forEach(child => {
			queue.push({ node: child, depth: depth + 1 });
		  });
		}
	  }
	}
  
	// If nothing was found in either direction up to maxDepth, return the original target.
	return target;
}

function isElementClickable(el){
	if (!el || el.nodeType !== 1) return false;

	// 1. inline or programmatic click handler
	if (el.onclick || el.hasAttribute('onclick') ||
		(window.getEventListeners?.(el).click||[]).length){
			return true;
		}

	// 2. ARIA role / keyboard focus
	const role = (el.getAttribute('role')||'').toLowerCase();
	if (['option','menuitem','menuitemcheckbox','menuitemradio',
		 'button','link','tab'].includes(role)){
			return true;
		 }

	if (el.hasAttribute('tabindex') &&
		parseInt(el.getAttribute('tabindex'),10) >= 0){
			return true;
		}

	// 3. visual pointer cue
	const style = window.getComputedStyle(el);
	if (style.cursor === 'pointer'){
		return true;
	}

	// 4. jsaction like “click:…”
	if (/(\s|^)click:/.test(el.getAttribute('jsaction')||'')){
		return true;
	}
	return false;
  }

function findFirstLinkElementOrNone(start){
	if (!start) return null;

	const INTERACTIVE_SKIP = new Set([
		'button','input','select','textarea',
		'details','summary','label','option',
		'optgroup','fieldset','legend'
	  ]);
	  
	  // Limit upward traversal to at most 5 layers.
	  let el = start, depth = 0;
	  while (el && depth < 5) {
		if (el.tagName === 'A') return el;
		// If you encounter an interactive element (other than an anchor)
		if (INTERACTIVE_SKIP.has(el.tagName.toLowerCase())) {
		  console.log("Found interactive element in the upward chain. Exiting:", el.tagName);
		  return null;  // Let the other listener handle this case.
		}
		if (isElementClickable(el)) return el;
		el = el.parentElement;
		depth++;
	  }

	  return null;

	//   function searchChildren(node, level = 1) {
	// 	if (!node || level > 2) return null;
	// 	for (const child of node.children) {
	// 	  if (child.tagName === 'A' || isElementClickable(child)) return child;
	// 	}
	// 	for (const child of node.children) {
	// 	  const found = searchChildren(child, level + 1);
	// 	  if (found) return found;
	// 	}
	// 	return null;
	//   }
	//   return searchChildren(start);
}


  function getCachedBoundingRect(element) {
    if (!element) return null;

    if (DOM_CACHE.boundingRects.has(element)) {

      return DOM_CACHE.boundingRects.get(element);
    }


    let rect;
	rect = element.getBoundingClientRect();

    if (rect) {
      DOM_CACHE.boundingRects.set(element, rect);
    }
    return rect;
  }


/**
 * Checks if an element is within the expanded viewport.
 */
function isInExpandedViewport(element, viewportExpansion) {
	if (viewportExpansion === -1) {
		return true;
	}

	const rect = getCachedBoundingRect(element);

	// Simple viewport check without scroll calculations
	return !(
		rect.bottom < -viewportExpansion ||
		rect.top > window.innerHeight + viewportExpansion ||
		rect.right < -viewportExpansion ||
		rect.left > window.innerWidth + viewportExpansion
	);
	}


  /**
 * Recursively clone a node, but only include nodes that are visible in the viewport.
 * For element nodes, if the node itself is not visible (per isInExpandedViewport),
 * the function returns null. Otherwise, it clones the node (without children) and
 * then appends visible cloned children.
 *
 * @param {Node} node - The node to clone.
 * @param {number} viewportExpansion - Parameter for viewport check.
 * @return {Node|null} The cloned visible node, or null if it should not be included.
 */
function cloneVisible(node, viewportExpansion = 0) {
  // For text nodes, just clone them.
  if (node.nodeType === Node.TEXT_NODE) {
    // Optionally, you can check for whitespace-only text.
    if (!node.textContent.trim()) {
      return null;
    }
    return node.cloneNode(false);
  }

  // For element nodes, check visibility.
  if (node.nodeType === Node.ELEMENT_NODE) {
    // If the element is not visible per our check, skip it.
	const isInVpoint = isInExpandedViewport(node, viewportExpansion)
    if (!isInVpoint) {
      return null;
    }

    // Create a shallow clone (without children)
    let clone = node.cloneNode(false);

    // Recursively process children.
    node.childNodes.forEach(child => {
      const clonedChild = cloneVisible(child, viewportExpansion);
      if (clonedChild) {
        clone.appendChild(clonedChild);
      }
    });

    return clone;
  }

  // For other node types (comments, etc.), you can choose whether to keep them.
  return null;
}

/**
 * Gets the HTML string for the current page but only for visible nodes.
 *
 * @param {number} viewportExpansion - How much extra area to consider as visible.
 * @return {string} The HTML string containing only nodes in the viewport.
 */
function getVisibleHTML(viewportExpansion = 0) {
	DOM_CACHE.clearCache();
  // Clone the document element (or document.body if preferred)
  const clone = document.documentElement.cloneNode(false);
  // Process all children from the original document.documentElement.
  document.documentElement.childNodes.forEach(child => {
	  const clonedChild = cloneVisible(child, viewportExpansion);
	  if (clonedChild) {
      clone.appendChild(clonedChild);
    }
  });

  if (MASK_DATA) { maskNode(clone); }

  return clone.outerHTML;
}


function getUniqueIdentifierForInput(element) {
	let uid = element.getAttribute(OTA_INPUT_ELEMENT_UNIQUE_ID_PREFIX);
	if (!uid) {
	uid = 'input-' + Math.floor(Math.random() * 10000);
	element.setAttribute(OTA_INPUT_ELEMENT_UNIQUE_ID_PREFIX, uid);
	}
	return uid;
  }

/**
 * Recursively builds a trimmed HTML string from the given node.
 * Only goes N layers deep. Deeper nested content is replaced with a placeholder.
 *
 * @param {Node} node - The DOM node to trim.
 * @param {number} maxDepth - Maximum depth to include.
 * @param {number} currentDepth - Current recursion level (default 0).
 * @return {string} The HTML string representing the trimmed node.
 */
function trimElementWithPlaceholder(node, maxDepth = 5, currentDepth = 0) {

	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent;
		}
	
		// Skip non-element nodes (you might extend this if needed).
		if (node.nodeType !== Node.ELEMENT_NODE) {
		return '';
		}
	
	// Build the opening tag with all its attributes intact.
	let tagName = node.tagName.toLowerCase();
	let attrString = '';
	// Iterate through all attributes
	for (let i = 0; i < node.attributes.length; i++) {
		const attr = node.attributes[i];
		attrString += ` ${attr.name}="${attr.value}"`;
	}

	let openingTag = `<${tagName}${attrString}>`;
	let closingTag = `</${tagName}>`;

	// If we've reached or exceeded the max depth, insert the marker
	if (currentDepth >= maxDepth - 1) {
	return `${openingTag}#rme${closingTag}`;
	}

	// Otherwise, process the child nodes recursively.
	let childrenHTML = '';
	node.childNodes.forEach(child => {
	childrenHTML += trimElementWithPlaceholder(child, maxDepth, currentDepth + 1);
	});

	return `${openingTag}${childrenHTML}${closingTag}`;
}

function trimTarget(node){
	let trimmedHtml = trimElementWithPlaceholder(node, 4);

	if (trimmedHtml.length < 200) {
		return trimmedHtml;
	}

	var purifyConfig = {
		ALLOWED_TAGS: [
		  'a', 'abbr', 'address', 'article', 'aside',
		  'b', 'blockquote', 'br', 'button', 'caption',
		  'cite', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		  'hr', 'i', 'img', 'input', 'label', 'li', 'ol', 'p', 'q',
		  'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
		  'tfoot', 'th', 'thead', 'tr', 'ul', 'select', 'option', 'textarea',
		  'svg', 'path'
		],
		ALLOWED_ATTR: [
		  'id', 'class', 'href', 'src', 'alt', 'ota-use-interactive-target',
		  'role', 'aria-label', 'aria-labelledby', 'aria-describedby',
		  'placeholder', 'type', 'value', 'name', 'checked', 'selected'
		]
	};
	return DOMPurify.sanitize(trimmedHtml, purifyConfig);
}


function trimChangedEventNode(node, max_depth = 3){
	let trimmedHtml = trimElementWithPlaceholder(node, max_depth);

	if (trimmedHtml.length < 200) {
		return trimmedHtml;
	}

	const isWholeDocument = /^\s*<html\b/i.test(trimmedHtml);

	var purifyConfig = {
		WHOLE_DOCUMENT: isWholeDocument,
		ALLOWED_TAGS: [
		  'a', 'abbr', 'address', 'article', 'aside',
		  'b', 'blockquote', 'br', 'button', 'caption',
		  'cite', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		  'hr', 'i', 'img', 'input', 'label', 'li', 'ol', 'p', 'q',
		  'small', 'span', 'strong', 'sub', 'table', 'tbody', 'td',
		  'tfoot', 'th', 'thead', 'tr', 'ul', 'select', 'option', 'textarea',
		  'svg', 'path', 'html', 'header', 'body'
		],
		ALLOWED_ATTR: [
		  'id', 'href', 'alt', 'ota-use-interactive-target',
		  'role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
		  'placeholder', 'type', 'value', 'name', 'checked', 'selected', 'disabled'
		]
	};
	return DOMPurify.sanitize(trimmedHtml, purifyConfig);
}

function maskString(str) {
	return str
	  .replace(CREDIT_CARD,  '[CARD]')
	  .replace(SSN,          '[SSN]')
	  .replace(EMAIL,        '[EMAIL]');
}

function maskNode(node) {
	if (node.nodeType === Node.TEXT_NODE) {
	  node.textContent = maskString(node.textContent);
	  return;
	}
  
	if (node.nodeType !== Node.ELEMENT_NODE) return;
  
	// ----- <input>, <textarea>, etc. -----
	if (['INPUT','TEXTAREA'].includes(node.tagName)) {
	  const type = (node.getAttribute('type') || '').toLowerCase();
	  const name = (node.getAttribute('name') || '').toLowerCase();
  
	  const looksSensitive =
		type === 'password' ||
		SENSITIVE_FIELD_NAMES.some(key => name.includes(key));
  
	  if (looksSensitive) {
		node.setAttribute('value',  '[MASKED]');
		node.value = '[MASKED]';          // for completeness
	  } else if (node.value || node.getAttribute('value')) {
		const clean = maskString(node.value || node.getAttribute('value') || '');
		node.setAttribute('value', clean);
		node.value = clean;
	  }
	}
  
	// ----- attributes on any element -----
	for (const attr of [...node.attributes]) {
	  if (!attr.value) continue;
	  const lowerName = attr.name.toLowerCase();
  
	  // mask password‑ish attributes or just run regex cleaner
	  if (lowerName === 'value' || lowerName === 'placeholder' ||
		  lowerName.startsWith('data-') ||
		  SENSITIVE_FIELD_NAMES.some(k => lowerName.includes(k))) {
		node.setAttribute(attr.name, maskString(attr.value));
	  }
	}
  
	// recurse children
	node.childNodes.forEach(maskNode);
  }
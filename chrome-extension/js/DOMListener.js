(function () {
    "use strict";
	console.log("Content script loaded");

    var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
	window.lastClickedTarget = null;
	window.OTAinputFieldValues = {};

	let clickTimer = null;
	let doubleClicked = false;
	let pageContentIntervalId = null;
	let taskId = null;
	let taskDescription = "";
	const CLICK_DELAY = 500; // delay in ms to distinguish single vs double clic
	const TopKEvents = 40;

	var mutationBuffer = [];
	var BUFFER_WINDOW = 1000; // milliseconds for before/after user action
	let _globalEventHash = null;   // current hash or null
	let _hashResetTimer  = null;   // id returned by setTimeout

    if (typeof MutationObserver !== 'function') {
        console.error('DOM Listener Extension: MutationObserver is not available in your browser.');
        return;
    }

    var observer = new MutationObserver(onMutation);
	const observerSettings = {
		subtree      : true,
		childList    : true,
		attributes   : true,
		attributeOldValue : true,
		attributeFilter   : [
		   // only attrs that matter for UX or navigation
		   'href','src','value','aria-label','title',
		   'aria-expanded','aria-selected','aria-pressed'
		],
		characterData: false
	};

    var nodeRegistry = [];

    var bgPageConnection = chrome.runtime.connect({
        name: "content-script"
    });

    bgPageConnection.postMessage({
        type: 'connected',
    });

    function highlightNode(node, color) {
        color = color || { r: 51, g: 195, b: 240 };

        if (node && node.nodeName === '#text') {
            highlightNode(node.parentNode, color);
        } else if (node && node.style) {
            var boxShadowOrg = node.style.boxShadow;

            var player = node.animate([
                { boxShadow: '0 0 0 5px rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', 1)' },
                { boxShadow: '0 0 0 5px rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', 0)' }
            ], 600);

            player.onfinish = function () {
                node.style.boxShadow = boxShadowOrg;
            };
        }
    }

    function scrollIntoView(node) {
        if (node && node.nodeName === '#text') {
            scrollIntoView(node.parentNode);
        } else if (node.scrollIntoViewIfNeeded) {
            node.scrollIntoViewIfNeeded();
        }
    }

    function nodeToSelector(node, contextNode) {
        if (node.id) {
            return '#' + node.id;
        } else if (node.classList && node.classList.length) {
            return node.tagName + '.' + Array.prototype.join.call(node.classList, '.');
        } else if (node.parentElement && node.parentElement !== contextNode) {
            var parentSelector = nodeToSelector(node.parentElement, contextNode);

            if (node.nodeName === '#comment') {
                return parentSelector + ' > (comment)';
            } else if (node.nodeName === '#text') {
                return parentSelector + ' > (text)';
            } else {
                return parentSelector + ' > ' + node.nodeName;
            }
        } else if (node.nodeName) {
            if (node.nodeName === '#comment') {
                return '(comment)';
            } else if (node.nodeName === '#text') {
                return '(text)';
            } else {
                return node.nodeName;
            }
        } else {
            return '(unknown)';
        }
    }

	function nodeToHTMLString(node) {
		if (!node) return '';
	  
		switch (node.nodeType) {
		  case Node.ELEMENT_NODE:
			return trimChangedEventNode(node, 5);
		  case Node.TEXT_NODE:
			return node.nodeValue;
		  case Node.COMMENT_NODE:
			return '<!-- ' + node.nodeValue + ' -->';
		  default:
			return '';
		}
	  }
	
    function nodesToObjects(nodes, contextNode) {
        return Array.prototype.map.call(nodes, function (node) {
            return nodeToObject(node, contextNode);
        });
    }

    function nodeToObject(node, contextNode) {
        var nodeId = nodeRegistry.indexOf(node);

        if (nodeId === -1) {
            nodeRegistry.push(node);
            nodeId = nodeRegistry.length - 1;
        }

        return {
            selector: nodeToSelector(node, contextNode),
			nodeInfo: nodeToHTMLString(node),
            nodeId: nodeId
        };
    }

    function logEvent(event) {
        event.date = Date.now();

        bgPageConnection.postMessage({
            type: 'event',
            event: event
        });
    }

    function isAttached(node) {
        if (node === document) {
            return true;
        } else if (node.parentNode) {
            return isAttached(node.parentNode);
        } else if (node.host) {
            return isAttached(node.host);
        }

        return false;
    }

    function cleanUpNodeRegistry() {
        //get rid of detached nodes
        for (var i = 0, l = nodeRegistry.length; i < l; i++) {
            var node = nodeRegistry[i];

            if (node && !isAttached(node)) {
                nodeRegistry[i] = null;
            }
        }
    }

    function onMutation(records) {
        var now = Date.now();
        for (var i = 0, l = records.length; i < l; i++) {
            var record = records[i];
            record.timestamp = now;
            mutationBuffer.push(record);

            // For added nodes, still observe any new shadow roots
            if (record.type === 'childList' && record.addedNodes.length) {
                Array.prototype.forEach.call(record.addedNodes, function (node) {
                    findShadowRoots(node).forEach(function (shadowRoot) {
                        observer.observe(shadowRoot, observerSettings);
                    });
                });
            }

            // For removed nodes, clean up the registry
            if (record.type === 'childList' && record.removedNodes.length) {
                cleanUpNodeRegistry();
            }
        }
    }

    function transformRecord(record) {
		function isValidSelector(selector) {
			const nonValidSelectors = new Set(['NOSCRIPT', 'SCRIPT']);
			if (!selector) return false;
		
			const upperSelector = selector.toUpperCase();
			const parts = upperSelector.split('>').map(part => part.trim());
		
			for (const part of parts) {
				if (nonValidSelectors.has(part)) {
					return false;
				}
			}
			return !nonValidSelectors.has(selector);
		}
        if (record.type === 'childList') {
            var events = [];
            if (record.addedNodes && record.addedNodes.length) {

				let event = {
                    type: 'nodes added',
                    target: nodeToObject(record.target),
                    nodes: nodesToObjects(record.addedNodes, record.target)
                }
				if(isValidSelector(event.nodes[0].selector)){
					events.push(event);
				}
				Array.prototype.forEach.call(record.addedNodes, function (node) {
					highlightNode(node, {r: 138, g: 219, b: 246});
				});
            }
            if (record.removedNodes && record.removedNodes.length) {

				let event = {
                    type: 'nodes removed',
                    target: nodeToObject(record.target),
                    nodes: nodesToObjects(record.removedNodes, record.target)
                }
				if(isValidSelector(event.nodes[0].selector)){
					events.push(event);
				}
				highlightNode(record.target, {r: 255, g: 198, b: 139});
            }
            // Return a single event if only one exists, else an array.
            return events.length === 1 ? events[0] : events;
        } else if (record.type === 'attributes') {
			if(record.attributeName != "ota-use-interactive-target"){
				highlightNode(record.target, {r: 179, g: 146, b: 248});
			}
			let event = {
                type: 'attribute changed',
                target: nodeToObject(record.target),
                attribute: record.attributeName,
                oldValue: record.oldValue,
                newValue: record.target.getAttribute(record.attributeName)
            };
			if(isValidSelector(event.target.selector)){
				return event;
			}
        } else if (record.type === 'characterData') {
			highlightNode(record.target, {r: 254, g: 239, b: 139});
            return {
                type: 'text changed',
                target: nodeToObject(record.target),
                oldValue: record.oldValue,
                newValue: record.target.data
            };
        }
        return null;
    }

	function sendPageContentUpdatetoBackground(status) {

		if (status == "update"){
			chrome.runtime.sendMessage({
			  type: 'update-page-content',
			  sanitizedPageHTML: getCurrentHTMLSanitized()
			}, function(response) {
				taskId = response.taskId;
			});
		}
		else if (status == "delete"){
			chrome.runtime.sendMessage({
				type: 'delete-page-content'
			  }, function(response) {
				console.log("Content script: Page content delete request sent", response);
			  });
		}
		else if (status === "task-start") {
			var summaryEvent = {
				taskId: taskId,
				eventHash: getEventHash(),
				taskDescription: taskDescription,
				type: "task-start",
				actionTimestamp: Date.now(),
				eventTarget: {},
				allEvents: [{
					type: "task-start",
					current_url: window.location.href
				}],
				pageHTMLContent: getCurrentHTMLSanitized()
			};
			chrome.runtime.sendMessage({
			  type: 'task-start',
			  summaryEvent: summaryEvent
			}, function(response) {
				taskId = response.taskId;
			  console.log("Content script: Task start message sent", response);
			});
		  } else if (status === "task-finish"){
			var summaryEvent = {
				taskId: taskId,
				eventHash: getEventHash(),
				taskDescription: taskDescription,
				type: "task-finish",
				actionTimestamp: Date.now(),
				eventTarget: {},
				allEvents: [{
					type: "task-finish",
					current_url: window.location.href
				}],
				pageHTMLContent: getCurrentHTMLSanitized()
			};
			  chrome.runtime.sendMessage({
				type: 'task-finish',
				summaryEvent: summaryEvent
			}, function(response) {
				console.log("Content script: Task finish message sent", response);
			  });
		  }
	}

	function _newEventHash(){
		return [...crypto.getRandomValues(new Uint8Array(8))]
			   .map(b => b.toString(16).padStart(2,'0'))
			   .join('');
	}

	function getEventHash(){
		if (_globalEventHash === null){
		  _globalEventHash = _newEventHash();

		  // Clear after 500 ms so the next physical action gets its own id
		  if (_hashResetTimer) clearTimeout(_hashResetTimer);
		  _hashResetTimer = setTimeout(() => {
			_globalEventHash = null;
			_hashResetTimer  = null;
		  }, 500);
		}
		return _globalEventHash;
	}

	function filterValidEvents(allEvents) {
		return allEvents.filter(event => {
			if (event.type === "attribute changed") {
				if(event.attribute === "ota-use-interactive-target"){
					return false;
				}
				// If oldValue and newValue are identical, discard this event.
				return event.oldValue !== event.newValue;
			}
			return true;
		});
	}

	function dedupPush(acc, evt){
		if (!evt) return acc;
		const key = `${evt.type}|${evt.target?.selector}`;
		if (acc._seen.has(key)) return acc;
		acc._seen.add(key);
		acc.list.push(evt);
		return acc;
	}

	function scoreEvent(evt){
		if (evt.type.startsWith('nodes added') ||
			evt.type.startsWith('nodes removed')) return 3;
		if (evt.type === 'text changed')          return 2;
		if (evt.type === 'attribute changed')
			return /^(href|value)$/i.test(evt.attribute) ? 2 : 1;
		return 0;
	}

	function getCurrentHTMLSanitized(){
		// Add a hook to remove inline styles after attributes are sanitized.
		DOMPurify.addHook('afterSanitizeAttributes', function(node) {
			if (node.hasAttribute && node.hasAttribute('style')) {
			node.removeAttribute('style');
			}
		});
		
		var config = {
			ALLOWED_TAGS: [
			'a', 'abbr', 'address', 'article', 'aside', 'audio', 
			'b', 'blockquote', 'br', 'button', 'caption', 'cite', 'code', 'col', 'colgroup', 
			'data', 'datalist', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 
			'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 
			'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'ins', 'label', 'legend', 
			'li', 'main', 'menu', 'nav', 'ol', 'option', 'output', 'p', 'pre', 'progress', 
			'q', 's', 'section', 'select', 'small', 'span', 'strong', 'sub', 'summary', 'svg',
			'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'textarea', 'time', 'tr', 'ul', 'video',
			'html', 'title', 'body'
			],
			ALLOWED_ATTR: [
			'abbr', 'accept', 'accept-charset', 'accesskey', 'action', 'align', 'alt', 
			'aria-describedby', 'aria-hidden', 'aria-label', 'aria-labelledby', 'border', 
			'cellpadding', 'cellspacing', 'checked', 'cite', 'class', 'cols', 'colspan', 
			'content', 'data', 'datetime', 'default', 'dir', 'disabled', 'download', 'draggable', 
			'enctype', 'for', 'height', 'hidden', 'high', 'href', 'hreflang', 'id', 'inputmode', 
			'ismap', 'label', 'lang', 'list', 'loop', 'low', 'max', 'maxlength', 'media', 
			'method', 'min', 'multiple', 'muted', 'name', 'novalidate', 'onabort', 'onblur', 
			'onchange', 'onclick', 'oncontextmenu', 'onfocus', 'oninput', 'oninvalid', 
			'onreset', 'onscroll', 'onselect', 'onsubmit', 'outerHTML', 'placeholder', 
			'poster', 'preload', 'readonly', 'rel', 'required', 'reversed', 'rows', 'rowspan', 
			'sandbox', 'scope', 'selected', 'shape', 'size', 'span', 'spellcheck', 'src', 
			'srcdoc', 'start', 'step', 'style', 'tabindex', 'target', 'title', 'translate', 
			'type', 'usemap', 'value', 'width', 'wrap', 'ota-use-interactive-target',
			]
		};

		const visibleHTML = getVisibleHTML(0);
		return DOMPurify.sanitize(visibleHTML, config);
	}

    function handleUserAction(event, evHash) {

		if (CheckIsClickOnInputOrLabel(event)) {
			return;
		}

		var actionTarget = {
			type: event.type,
			target: nodeToHTMLString(event.target),
			targetId: event.target.id,
			targetClass: event.target.className
		}

		const bestInteractiveElement = findBestInteractiveElement(event.target, 3);
		bestInteractiveElement.setAttribute("ota-use-interactive-target", "1");

		if(bestInteractiveElement.tagName == "A"){
			bestInteractiveElement.removeAttribute("ota-use-interactive-target");
			return;
		}

		actionTarget.target = trimTarget(bestInteractiveElement);
        var actionTime = Date.now();

        // Get mutations that occurred within the BUFFER_WINDOW before the action.
        var beforeMutations = mutationBuffer.filter(function (record) {
            return actionTime - record.timestamp <= BUFFER_WINDOW && actionTime - record.timestamp >= 0;
        });

        // Clear the buffer so we can capture after-mutations freshly.
        mutationBuffer = [];

        // Wait for after-mutations to be recorded.
        setTimeout(function () {
            var afterMutations = mutationBuffer.filter(function (record) {
                return record.timestamp - actionTime <= BUFFER_WINDOW && record.timestamp - actionTime >= 0;
            });

			const MAX_MUTATIONS_PER_SIDE = 100;

			if (beforeMutations.length > MAX_MUTATIONS_PER_SIDE) {
				// keep the LAST `MAX` records (closest to the user action)
				beforeMutations =
				  beforeMutations.slice(-MAX_MUTATIONS_PER_SIDE);
			  }
			  if (afterMutations.length > MAX_MUTATIONS_PER_SIDE) {
				// keep the FIRST `MAX` records (immediately after the action)
				afterMutations =
				  afterMutations.slice(0, MAX_MUTATIONS_PER_SIDE);
			  }

            // // Transform the raw mutation records to the loggable event format.
			const beforeEventsRaw = beforeMutations.map(transformRecord).reduce((acc,item)=>{
			   if (Array.isArray(item)) return acc.concat(item);
			   if (item!=null && item!==undefined) acc.push(item);
			   return acc;
			},[]);

			const afterEventsRaw  = afterMutations.map(transformRecord).reduce((acc,item)=>{
				if (Array.isArray(item)) return acc.concat(item);
				if (item!=null && item!==undefined) acc.push(item);
				return acc;
			},[]);

			const beforeEvents = beforeEventsRaw.reduce((acc,e)=>dedupPush(acc,e), {_seen:new Set(),list:[]}).list;
			const afterEvents  = afterEventsRaw.reduce((acc,e)=>dedupPush(acc,e), {_seen:new Set(),list:[]}).list;
			var allEvents = beforeEvents.concat(afterEvents);
			allEvents = filterValidEvents(allEvents);
			allEvents.sort((a,b)=>scoreEvent(b)-scoreEvent(a));
			allEvents = allEvents.slice(0, TopKEvents);

			if( (allEvents.length == 0)){
				bestInteractiveElement.removeAttribute("ota-use-interactive-target");
				return;
			}

			bgPageConnection.postMessage({ type: 'clear-events' });

			var summaryEvent = {
				taskId: taskId,
				eventHash: evHash,
				type: event.type,
				actionTimestamp: actionTime,
				eventTarget: actionTarget,
				allEvents: allEvents,
				pageHTMLContent: getCurrentHTMLSanitized()
			};

			bestInteractiveElement.removeAttribute("ota-use-interactive-target");

			chrome.runtime.sendMessage({
				type: 'send-summary-event',
				summaryEvent: summaryEvent
			  }, function(response) {
				console.log("Response from background:", response);
			  });

            // Log the summary of mutations surrounding the user action.
			if (allEvents.length > 0) {
				allEvents.forEach(function(singleEvent) {
					if(singleEvent.attribute != "ota-use-interactive-target"){
						logEvent(singleEvent);
					}
				});
			  }

            // Clear the buffer after processing.
            mutationBuffer = [];
        }, BUFFER_WINDOW);
    }

	function readControlValue(el) {
		if (el.type === 'checkbox' || el.type === 'radio') {
		  return el.checked;                        // boolean
		}
		if (el.tagName === 'SELECT') {
		  // handles <select multiple>
		  return Array.from(el.selectedOptions).map(o => o.value).join('|');
		}
		if (el.type === 'file') {
		  return Array.from(el.files).map(f => f.name).join('|');
		}
		return el.value ?? el.textContent;          // text, search, textarea, contentEditable
	  }


	function handleInputChange(event) {
		let eventHash = getEventHash();

		var actionTarget = {
			type: event.type,
			target: nodeToHTMLString(event.target),
			targetId: event.target.id,
			targetClass: event.target.className,
			value: readControlValue(event.target)
		}

		const bestInteractiveElement = findBestInteractiveElement(event.target, 3);
		bestInteractiveElement.setAttribute("ota-use-interactive-target", "1");

		actionTarget.target = trimTarget(bestInteractiveElement);
        var actionTime = Date.now();

        // Get mutations that occurred within the BUFFER_WINDOW before the action.
        var beforeMutations = mutationBuffer.filter(function (record) {
            return actionTime - record.timestamp <= BUFFER_WINDOW && actionTime - record.timestamp >= 0;
        });

        // Clear the buffer so we can capture after-mutations freshly.
        mutationBuffer = [];

        // Wait for after-mutations to be recorded.
        setTimeout(function () {
            var afterMutations = mutationBuffer.filter(function (record) {
                return record.timestamp - actionTime <= BUFFER_WINDOW && record.timestamp - actionTime >= 0;
            });

			const MAX_MUTATIONS_PER_SIDE = 30;

			if (beforeMutations.length > MAX_MUTATIONS_PER_SIDE) {
				// keep the LAST `MAX` records (closest to the user action)
				beforeMutations =
				  beforeMutations.slice(-MAX_MUTATIONS_PER_SIDE);
			  }
			  if (afterMutations.length > MAX_MUTATIONS_PER_SIDE) {
				// keep the FIRST `MAX` records (immediately after the action)
				afterMutations =
				  afterMutations.slice(0, MAX_MUTATIONS_PER_SIDE);
			  }

            // // Transform the raw mutation records to the loggable event format.
			const beforeEventsRaw = beforeMutations.map(transformRecord).reduce((acc,item)=>{
			   if (Array.isArray(item)) return acc.concat(item);
			   if (item!=null && item!==undefined) acc.push(item);
			   return acc;
			},[]);

			const afterEventsRaw  = afterMutations.map(transformRecord).reduce((acc,item)=>{
				if (Array.isArray(item)) return acc.concat(item);
				if (item!=null && item!==undefined) acc.push(item);
				return acc;
			},[]);

			const beforeEvents = beforeEventsRaw.reduce((acc,e)=>dedupPush(acc,e), {_seen:new Set(),list:[]}).list;
			const afterEvents  = afterEventsRaw.reduce((acc,e)=>dedupPush(acc,e), {_seen:new Set(),list:[]}).list;
			var allEvents = beforeEvents.concat(afterEvents);
			allEvents = filterValidEvents(allEvents);
			allEvents.sort((a,b)=>scoreEvent(b)-scoreEvent(a));
			allEvents = allEvents.slice(0, TopKEvents);

			bgPageConnection.postMessage({ type: 'clear-events' });

			var summaryEvent = {
				taskId: taskId,
				eventHash: eventHash,
				type: "input-change",
				actionTimestamp: actionTime,
				eventTarget: actionTarget,
				allEvents: allEvents,
				pageHTMLContent: getCurrentHTMLSanitized()
			};

			bestInteractiveElement.removeAttribute("ota-use-interactive-target");

			chrome.runtime.sendMessage({
				type: 'input-value-changed',
				summaryEvent: summaryEvent
			  }, function(response) {
				console.log("Response from background:", response);
			  });

            // Log the summary of mutations surrounding the user action.
			if (allEvents.length > 0) {
				allEvents.forEach(function(singleEvent) {
					if(singleEvent.attribute != "ota-use-interactive-target"){
						logEvent(singleEvent);
					}
				});
			  }

            // Clear the buffer after processing.
            mutationBuffer = [];
        }, BUFFER_WINDOW);
    }

	function handleUserClickLink(event, evHash) {
		// For example, we want to capture data when a link (<a>) is clicked.
		let target = event.target;		
		// Traverse up the DOM tree to find an anchor if the clicked element isn’t directly an <a>
		target = findFirstLinkElementOrNone(target);

		if (target && (target.tagName === 'A' || isElementClickable(target))) {

			var actionTarget = {
				type: event.type,
				target: nodeToHTMLString(target),
				targetId: target.id,
				targetClass: target.className
			}

			target.setAttribute("ota-use-interactive-target", "1");
			actionTarget.target = trimTarget(target);
			var sanitizedPageHTML = getCurrentHTMLSanitized();
			var summaryEvent = {
				taskId: taskId,
				eventHash: evHash,
				type: event.type,
				actionTimestamp: Date.now(),
				eventTarget: actionTarget,
				allEvents: {},
				pageHTMLContent: sanitizedPageHTML
			};

		  // Send the click data to the background script.
		  chrome.runtime.sendMessage({
			type: 'page-go-to',
			clickData: summaryEvent
		  });
		  return true;
		}
		return false;
	}


	function CheckIsClickOnInputOrLabel (event) {
		const INPUT_SEL = 'input, textarea, select, [contenteditable="true"]';

		/* A. direct click on a form control  */
		if (event.target.matches(INPUT_SEL)) return true;

		/* B. click on a <label> that is linked to a control */
		if (event.target.tagName === 'LABEL') {
		  let associated = null;

		  // label[for="id"]  ↓
		  if (event.target.hasAttribute('for')) {
			associated = document.getElementById(event.target.getAttribute('for'));
		  }
		  // implicit <label><input …></label> ↓
		  if (!associated) {
			associated = event.target.querySelector(INPUT_SEL);
		  }

		  if (associated) return true;
		}
		/* not a form-control click */
		return false;
	  }

	function debouncedClickHandler(event) {
		// If a click occurs, clear any existing timer.
		if (clickTimer) {
		clearTimeout(clickTimer);
		clickTimer = null;
		}

		const evHash = getEventHash();
		handleUserClickLink(event, evHash);
		
		// Start the timer for a single click.
		clickTimer = setTimeout(() => {
		// If no double click has happened, process as a single click.
		if (!doubleClicked) {
			handleUserAction(event, evHash);
		}
		// Reset the double click flag and timer.
		clickTimer = null;
		doubleClicked = false;
		}, CLICK_DELAY);
	}

	function dblClickHandler(event) {
		// Mark that a double click occurred.
		doubleClicked = true;
		// If a timer is pending for single click, cancel it.
		if (clickTimer) {
		clearTimeout(clickTimer);
		clickTimer = null;
		}

		const evHash = getEventHash();
		handleUserClickLink(event, evHash);

		// Process double click action.
		console.log("[OTA Record]: double click triggered");
		handleUserAction(event, evHash);
	}

	function getSimpleSelector(el) {
		if (el.id) return `#${el.id}`;
		if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
		return el.tagName.toLowerCase();
	  }

	function submitHandler(event) {
		const form = event.target;                       // <form> element
		const formData = new FormData(form);
	  
		// Build a detailed map: name → { value, selector, tag, type }
		const detailedValues = {};
	  
		// Look at every possible control inside this form
		form.querySelectorAll('input, select, textarea, button').forEach(el => {
		  const name = el.name || el.id || null;         // give it a key
		  if (!name) return;                             // skip unnamed controls
	  
		  // For checkboxes/radios you may want el.checked instead of value
		  let rawValue = (el.type === 'checkbox' || el.type === 'radio')
						  ? (el.checked ? el.value : null)
						  : el.value;
	  
		  // Only store if this element contributed to the submission
		  // (FormData will have the real list; this keeps them in sync)
		  if (!formData.has(name)) return;
	  
		  detailedValues[name] = {
			value:    rawValue,
			selector: nodeToSelector ? nodeToSelector(el, form) : getSimpleSelector(el),
			tag:      el.tagName.toLowerCase(),
			type:     el.type || null
		  };
		});

		let target = event.target;
		target.setAttribute("ota-use-interactive-target", "1");

		var actionTarget = {
			type: event.type,
			target: trimTarget(target),
			selector: nodeToSelector ? nodeToSelector(form, null) : 'form'
		};
	  
		// Build your normal summaryEvent…
		const summaryEvent = {
		  taskId: taskId,
		  eventHash: getEventHash(),
		  type:            event.type,
		  actionTimestamp: Date.now(),
		  eventTarget:     actionTarget,
		  allEvents: detailedValues,
		  pageHTMLContent: getCurrentHTMLSanitized()
		};

		chrome.runtime.sendMessage({ type: 'submit', summaryEvent });
		target.removeAttribute("ota-use-interactive-target");
	  }

    function findShadowRoots(node, list) {
        list = list || [];

        if (node.shadowRoot) {
            list.push(node.shadowRoot);
        }

        if (node && node.querySelectorAll) {
            Array.prototype.forEach.call(node.querySelectorAll('*'), function (child) {
                if (child.tagName && child.tagName.indexOf('-') > -1 && child.shadowRoot) {
                    findShadowRoots(child, list);
                }
            });
        }

        return list;
    }

	function setupListeners(task_start=false){
		observer.disconnect();
		//observe the main document
		observer.observe(document, observerSettings);
		//observe all shadow roots
		findShadowRoots(document).forEach(function (shadowRoot) {
			observer.observe(shadowRoot, observerSettings);
		});

		document.addEventListener('click', debouncedClickHandler, true);
		document.addEventListener('dblclick', dblClickHandler, true);
		document.addEventListener('submit', submitHandler);
		document.addEventListener('change', handleInputChange, true);
		// window.addEventListener('popstate', handleUserAction);
		if(task_start){ sendPageContentUpdatetoBackground("task-start"); }
		pageContentIntervalId = setInterval(() => { sendPageContentUpdatetoBackground("update"); }, 500);
		console.log("Started listening and page-content polling every 500ms");
	}

	function removeListeners(task_finish=false){
		if(task_finish){ sendPageContentUpdatetoBackground("task-finish"); }
		observer.disconnect();
		document.removeEventListener('click', debouncedClickHandler);
		document.removeEventListener('dblclick', dblClickHandler);
		document.removeEventListener('submit', submitHandler);
		document.removeEventListener('change', handleInputChange);
		// window.removeEventListener('popstate', handleUserAction);

		if (pageContentIntervalId  != null) {
			clearInterval(pageContentIntervalId );
			pageContentIntervalId = null;
		}

		sendPageContentUpdatetoBackground("delete");
		console.log("Stopped listening and cleared page-content polling");
	}

    if (!window.domListenerExtension) {
        window.domListenerExtension = {
            startTaskRecording: function (desc) {
				taskDescription = desc;
				setupListeners(true);
			},
            pauseTaskRecording: function () { removeListeners(); },
			resumeTaskRecording: function(desc){
				taskDescription = desc;
				setupListeners();
			},
			finishTaskRecording: function () { removeListeners(true); },
			getNode: function (nodeId) { return nodeRegistry[nodeId]; },
            highlightNode: function (nodeId) {
                var node = this.getNode(nodeId);
                scrollIntoView(node);
                highlightNode(node);
            },
        };
    }
})();
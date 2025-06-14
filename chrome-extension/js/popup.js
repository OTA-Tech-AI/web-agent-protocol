(function(){
  "use strict";

  // —— UI 绑定 —— 
  const clearBtn   = document.querySelector('.clear');
  const recordBtn  = document.querySelector('.record-btn');
  const descInput  = document.querySelector('.task-desc-input');
  const table      = document.querySelector('.events');
  const eventTable = new EventTable(table);

  let currentTabId, recording = false;

  // —— 建立和 background 的长连接 —— 
  const port = chrome.runtime.connect({ name: 'popup' });
  port.onMessage.addListener(msg => {
    console.log('📝 popup received message:', msg);
    const { tabId, event, recording: isRec } = msg;
    //if (tabId !== currentTabId) return;

    // —— 只要有 event 对象，就渲染它 ——
    if (event) {
      eventTable.addEvent(event);
      const rowCount = document.querySelector('.events tbody').children.length;
      console.log(`📝 popup: tbody now has ${rowCount} rows`);
      return;
    }

    // —— 同步录制状态 ——
    if (msg.type === 'recording-state') {
      recording = isRec;
      recordBtn.innerText = recording ? 'Stop Record' : 'Start Record';
      descInput.disabled  = recording;
    }
  });

  // —— 一打开就抓 tabId ——
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    currentTabId = tabs[0].id;
  });

  // —— 清空表格 ——
  clearBtn.addEventListener('click', () => {
    eventTable.clear();
  });

  // —— 开始/停止录制 ——
  recordBtn.addEventListener('click', () => {
    const desc = descInput.value.trim();
    console.log('📝 popup click recordBtn, recording=', recording, 'desc=', desc);

    if (!recording) {
      if (!desc) {
        console.warn('⚠️ popup: empty description, abort start-record');
        descInput.classList.add('invalid');
        return;
      }
      port.postMessage({ type: 'start-record', tabId: currentTabId, desc });
    } else {
      port.postMessage({ type: 'stop-record', tabId: currentTabId });
    }
  });
})();

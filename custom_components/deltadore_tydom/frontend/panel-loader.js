/* Delta Dore Tydom Panel Loader
 * This module configures the iframe for the custom panel
 */

(function() {
  'use strict';

  let iframe = null;
  
  // Function to send hass to iframe
  function sendHassToIframe() {
    if (!iframe || !iframe.contentWindow) {
      return;
    }
    
    // Try to get hass from various sources
    let hassObj = null;
    if (window.customPanel && window.customPanel.hass) {
      hassObj = window.customPanel.hass;
    } else if (window.hassConnection && window.hassConnection.hass) {
      hassObj = window.hassConnection.hass;
    } else if (window.hass) {
      hassObj = window.hass;
    }
    
    if (hassObj) {
      try {
        iframe.contentWindow.postMessage({
          type: 'hass',
          hass: hassObj
        }, '*');
      } catch (e) {
        console.error('Error passing hass to iframe:', e);
      }
    }
  }
  
  // Function to create and setup iframe
  function setupIframe() {
    if (iframe) {
      return; // Already created
    }
    
    // Wait for body to be available
    if (!document.body) {
      setTimeout(setupIframe, 50);
      return;
    }
    
    // Create iframe element
    iframe = document.createElement('iframe');
    iframe.src = '/api/deltadore_tydom/frontend/panel.html';
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.display = 'block';
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    
    // Set up communication with Home Assistant
    iframe.onload = function() {
      // Send hass immediately if available
      sendHassToIframe();
      
      // Also set up periodic check for hass updates
      const hassCheckInterval = setInterval(function() {
        sendHassToIframe();
      }, 500);
      
      // Clear interval after 30 seconds (hass should be available by then)
      setTimeout(function() {
        clearInterval(hassCheckInterval);
      }, 30000);
    };
    
    // Append iframe to body
    document.body.appendChild(iframe);
    
    // Ensure body and html take full height
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.height = '100%';
    document.documentElement.style.height = '100%';
  }
  
  // Listen for hass updates via customPanel
  if (window.customPanel) {
    // Override setHass if it exists
    if (typeof window.customPanel.setHass === 'function') {
      const originalSetHass = window.customPanel.setHass;
      window.customPanel.setHass = function(hass) {
        originalSetHass.call(this, hass);
        sendHassToIframe();
      };
    }
  }
  
  // Start setup when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupIframe);
  } else {
    setupIframe();
  }
  
  // Clean up on unload
  window.addEventListener('beforeunload', function() {
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
      iframe = null;
    }
  });
})();


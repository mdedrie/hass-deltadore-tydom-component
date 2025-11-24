/* Delta Dore Tydom Panel JavaScript */

(function() {
  'use strict';

  // Global state
  let hass = null;
  let currentEntryId = null;
  let refreshIntervals = {};
  let translations = {};

  // Initialize panel when Home Assistant is ready
  // Home Assistant panels receive hass object via window.hassConnection or custom panel API
  window.addEventListener('load', function() {
    // Try to get hass from various possible sources
    const getHass = function() {
      // Method 1: Custom panel API (most common)
      if (window.customPanel && window.customPanel.hass) {
        return window.customPanel.hass;
      }
      // Method 2: hassConnection
      if (window.hassConnection && window.hassConnection.hass) {
        return window.hassConnection.hass;
      }
      // Method 3: Direct window.hass
      if (window.hass) {
        return window.hass;
      }
      return null;
    };
    
    // Wait for Home Assistant to be available
    const checkHA = setInterval(function() {
      const hassObj = getHass();
      if (hassObj) {
        hass = hassObj;
        clearInterval(checkHA);
        initPanel();
      }
    }, 100);
    
    // Timeout after 10 seconds
    setTimeout(function() {
      clearInterval(checkHA);
      if (!hass) {
        console.error('Home Assistant not available after 10 seconds');
        showError('Impossible de se connecter à Home Assistant');
      }
    }, 10000);
  });

  function initPanel() {
    // Setup tabs
    setupTabs();
    
    // Setup instance selector
    setupInstanceSelector();
    
    // Setup devices tab
    setupDevicesTab();
    
    // Setup config tab
    setupConfigTab();
    
    // Setup actions tab
    setupActionsTab();
    
    // Setup logs tab
    setupLogsTab();
    
    // Load initial data
    loadInstances();
  }

  // Tab management
  function setupTabs() {
    const tabs = document.querySelectorAll('.tydom-tab');
    const tabContents = document.querySelectorAll('.tydom-tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', function() {
        const tabName = this.dataset.tab;
        
        // Remove active class from all tabs and contents
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        this.classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
        
        // Load data for the active tab
        loadTabData(tabName);
      });
    });
  }

  function loadTabData(tabName) {
    switch(tabName) {
      case 'status':
        loadStatus();
        break;
      case 'devices':
        loadDevices();
        break;
      case 'config':
        loadConfig();
        break;
      case 'logs':
        loadLogs();
        break;
    }
  }

  // Instance selector
  async function setupInstanceSelector() {
    const selector = document.getElementById('instance-select');
    if (!selector) return;

    selector.addEventListener('change', function() {
      currentEntryId = this.value || null;
      loadTabData(document.querySelector('.tydom-tab.active').dataset.tab);
    });
  }

  async function loadInstances() {
    try {
      const response = await callAPI('GET', '/api/deltadore_tydom/instances');
      const data = await response.json();
      
      const instances = data.instances || {};
      const selector = document.getElementById('instance-select');
      const selectorContainer = document.getElementById('instance-selector');
      
      if (Object.keys(instances).length > 1) {
        selectorContainer.style.display = 'block';
        selector.innerHTML = '<option value="">Toutes les instances</option>';
        
        for (const [entryId, instance] of Object.entries(instances)) {
          const option = document.createElement('option');
          option.value = entryId;
          option.textContent = instance.title || `Tydom-${instance.mac.slice(6)}`;
          selector.appendChild(option);
        }
      } else {
        selectorContainer.style.display = 'none';
        currentEntryId = Object.keys(instances)[0] || null;
      }
      
      // Load initial data
      loadStatus();
    } catch (error) {
      showError('Erreur lors du chargement des instances: ' + error.message);
    }
  }

  // Status tab
  async function loadStatus() {
    try {
      showLoading(true);
      const response = await callAPI('GET', `/api/deltadore_tydom/status${currentEntryId ? '?entry_id=' + currentEntryId : ''}`);
      const data = await response.json();
      
      // Update status indicator
      const indicator = document.getElementById('status-indicator');
      const statusText = document.getElementById('status-text');
      if (indicator && statusText) {
        indicator.className = 'status-indicator ' + (data.online ? 'online' : 'offline');
        statusText.textContent = data.online ? 'En ligne' : 'Hors ligne';
      }
      
      // Update info fields
      setElementText('status-host', data.host || '-');
      setElementText('status-mac', data.mac || '-');
      setElementText('status-mode', data.config_mode === 'tydom_cloud_account' ? 'Cloud' : 'Manuel');
      setElementText('status-refresh', data.refresh_interval ? data.refresh_interval + ' min' : '-');
      setElementText('status-total-devices', data.statistics?.total_devices || 0);
      setElementText('status-total-entities', data.statistics?.total_entities || 0);
      
      // Update zones
      if (data.zones) {
        setElementText('zone-home', data.zones.home || '-');
        setElementText('zone-away', data.zones.away || '-');
        setElementText('zone-night', data.zones.night || '-');
      }
      
      // Update devices by type
      const devicesTypeList = document.getElementById('devices-type-list');
      if (devicesTypeList && data.statistics?.devices_by_type) {
        devicesTypeList.innerHTML = '';
        for (const [type, count] of Object.entries(data.statistics.devices_by_type)) {
          const badge = document.createElement('span');
          badge.className = 'device-type-badge';
          badge.textContent = `${type}: ${count}`;
          devicesTypeList.appendChild(badge);
        }
      }
      
      showLoading(false);
    } catch (error) {
      showError('Erreur lors du chargement du statut: ' + error.message);
      showLoading(false);
    }
  }

  // Devices tab
  function setupDevicesTab() {
    const searchInput = document.getElementById('device-search');
    const typeFilter = document.getElementById('device-type-filter');
    
    if (searchInput) {
      searchInput.addEventListener('input', debounce(loadDevices, 300));
    }
    
    if (typeFilter) {
      typeFilter.addEventListener('change', loadDevices);
    }
  }

  async function loadDevices() {
    try {
      showLoading(true);
      const searchQuery = document.getElementById('device-search')?.value || '';
      const typeFilter = document.getElementById('device-type-filter')?.value || '';
      
      let url = `/api/deltadore_tydom/devices?`;
      if (currentEntryId) url += `entry_id=${currentEntryId}&`;
      if (typeFilter) url += `type=${typeFilter}&`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;
      
      const response = await callAPI('GET', url);
      const data = await response.json();
      
      // Update type filter options
      updateDeviceTypeFilter(data.devices);
      
      // Render devices table
      renderDevicesTable(data.devices || []);
      
      showLoading(false);
    } catch (error) {
      showError('Erreur lors du chargement des appareils: ' + error.message);
      showLoading(false);
    }
  }

  function updateDeviceTypeFilter(devices) {
    const typeFilter = document.getElementById('device-type-filter');
    if (!typeFilter) return;
    
    const types = new Set();
    devices.forEach(device => {
      if (device.type) types.add(device.type);
    });
    
    // Keep "All" option
    const allOption = typeFilter.querySelector('option[value=""]');
    typeFilter.innerHTML = '';
    if (allOption) typeFilter.appendChild(allOption);
    
    // Add type options
    Array.from(types).sort().forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeFilter.appendChild(option);
    });
  }

  function renderDevicesTable(devices) {
    const tbody = document.getElementById('devices-table-body');
    if (!tbody) return;
    
    if (devices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading">Aucun appareil trouvé</td></tr>';
      return;
    }
    
    tbody.innerHTML = devices.map(device => `
      <tr>
        <td>${escapeHtml(device.name || 'Unknown')}</td>
        <td>${escapeHtml(device.type || 'unknown')}</td>
        <td><code>${escapeHtml(device.device_id || '')}</code></td>
        <td>${escapeHtml(device.endpoint || '-')}</td>
        <td>
          <button class="mdc-button" onclick="showDeviceDetails('${escapeHtml(device.device_id)}')">
            Détails
          </button>
        </td>
      </tr>
    `).join('');
  }

  async function showDeviceDetails(deviceId) {
    try {
      const response = await callAPI('GET', `/api/deltadore_tydom/devices${currentEntryId ? '?entry_id=' + currentEntryId : ''}`);
      const data = await response.json();
      const device = data.devices?.find(d => d.device_id === deviceId);
      
      if (!device) {
        showError('Appareil non trouvé');
        return;
      }
      
      const modal = document.getElementById('device-modal');
      const modalTitle = document.getElementById('device-modal-title');
      const modalBody = document.getElementById('device-modal-body');
      
      if (modal && modalTitle && modalBody) {
        modalTitle.textContent = device.name || 'Détails de l\'appareil';
        modalBody.innerHTML = `
          <div><strong>Device ID:</strong> <code>${escapeHtml(device.device_id)}</code></div>
          <div><strong>Type:</strong> ${escapeHtml(device.type)}</div>
          <div><strong>Endpoint:</strong> ${escapeHtml(device.endpoint || '-')}</div>
          ${device.metadata ? `<div><strong>Métadonnées:</strong><pre>${JSON.stringify(device.metadata, null, 2)}</pre></div>` : ''}
          ${device.ha_entity ? `<div><strong>Entité HA:</strong> ${escapeHtml(device.ha_entity.entity_id || '-')}</div>` : ''}
        `;
        modal.classList.add('active');
      }
    } catch (error) {
      showError('Erreur lors du chargement des détails: ' + error.message);
    }
  };

  // Close modal
  document.addEventListener('click', function(e) {
    if (e.target.id === 'device-modal' || e.target.id === 'device-modal-close') {
      const modal = document.getElementById('device-modal');
      if (modal) modal.classList.remove('active');
    }
  });

  // Config tab
  function setupConfigTab() {
    const form = document.getElementById('config-form');
    const resetBtn = document.getElementById('config-reset-btn');
    
    if (form) {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        await saveConfig();
      });
    }
    
    if (resetBtn) {
      resetBtn.addEventListener('click', loadConfig);
    }
  }

  async function loadConfig() {
    try {
      showLoading(true);
      const response = await callAPI('GET', `/api/deltadore_tydom/config${currentEntryId ? '?entry_id=' + currentEntryId : ''}`);
      const data = await response.json();
      
      // Update form fields
      setInputValue('config-zones-home', data.zones?.home || '');
      setInputValue('config-zones-away', data.zones?.away || '');
      setInputValue('config-zones-night', data.zones?.night || '');
      setInputValue('config-refresh-interval', data.refresh_interval || '30');
      
      // Update readonly fields
      setElementText('config-host-display', data.host || '-');
      setElementText('config-mac-display', data.mac || '-');
      setElementText('config-mode-display', data.config_mode === 'tydom_cloud_account' ? 'Cloud' : 'Manuel');
      
      showLoading(false);
    } catch (error) {
      showError('Erreur lors du chargement de la configuration: ' + error.message);
      showLoading(false);
    }
  }

  async function saveConfig() {
    try {
      showLoading(true);
      const messageEl = document.getElementById('config-message');
      
      const data = {
        entry_id: currentEntryId,
        zones_home: getInputValue('config-zones-home'),
        zones_away: getInputValue('config-zones-away'),
        zones_night: getInputValue('config-zones-night'),
        refresh_interval: parseInt(getInputValue('config-refresh-interval')) || 30,
      };
      
      const response = await callAPI('POST', '/api/deltadore_tydom/config', data);
      const result = await response.json();
      
      if (result.success) {
        showMessage(messageEl, 'Configuration enregistrée avec succès', 'success');
        // Reload status to reflect changes
        setTimeout(loadStatus, 1000);
      } else {
        showMessage(messageEl, result.message || 'Erreur lors de l\'enregistrement', 'error');
      }
      
      showLoading(false);
    } catch (error) {
      const messageEl = document.getElementById('config-message');
      showMessage(messageEl, 'Erreur: ' + error.message, 'error');
      showLoading(false);
    }
  }

  // Actions tab
  function setupActionsTab() {
    const reloadBtn = document.getElementById('action-reload-devices');
    const testBtn = document.getElementById('action-test-connection');
    
    if (reloadBtn) {
      reloadBtn.addEventListener('click', async function() {
        if (confirm('Êtes-vous sûr de vouloir recharger tous les appareils ? Cette action supprimera toutes les entités existantes.')) {
          await executeAction('reload_devices');
        }
      });
    }
    
    if (testBtn) {
      testBtn.addEventListener('click', function() {
        executeAction('test_connection');
      });
    }
  }

  async function executeAction(action) {
    try {
      showLoading(true);
      const messageEl = document.getElementById('action-message');
      
      const response = await callAPI('POST', '/api/deltadore_tydom/actions', {
        action: action,
        entry_id: currentEntryId,
      });
      
      const result = await response.json();
      
      if (result.success) {
        showMessage(messageEl, result.message || 'Action exécutée avec succès', 'success');
        if (action === 'reload_devices') {
          // Reload devices and status after reload
          setTimeout(() => {
            loadDevices();
            loadStatus();
          }, 2000);
        }
      } else {
        showMessage(messageEl, result.message || 'Erreur lors de l\'exécution', 'error');
      }
      
      showLoading(false);
    } catch (error) {
      const messageEl = document.getElementById('action-message');
      showMessage(messageEl, 'Erreur: ' + error.message, 'error');
      showLoading(false);
    }
  }

  // Logs tab
  function setupLogsTab() {
    const levelFilter = document.getElementById('logs-level-filter');
    const limitSelect = document.getElementById('logs-limit');
    const autoRefresh = document.getElementById('logs-auto-refresh');
    const refreshInterval = document.getElementById('logs-refresh-interval');
    const refreshBtn = document.getElementById('logs-refresh-btn');
    const clearBtn = document.getElementById('logs-clear-btn');
    
    if (levelFilter) {
      levelFilter.addEventListener('change', loadLogs);
    }
    
    if (limitSelect) {
      limitSelect.addEventListener('change', loadLogs);
    }
    
    if (autoRefresh) {
      autoRefresh.addEventListener('change', function() {
        if (this.checked) {
          startLogsAutoRefresh();
        } else {
          stopLogsAutoRefresh();
        }
      });
    }
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadLogs);
    }
    
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        const logsContent = document.getElementById('logs-content');
        if (logsContent) logsContent.textContent = '';
      });
    }
    
    // Start auto-refresh if enabled
    if (autoRefresh && autoRefresh.checked) {
      startLogsAutoRefresh();
    }
  }

  function startLogsAutoRefresh() {
    stopLogsAutoRefresh(); // Clear any existing interval
    
    const intervalSelect = document.getElementById('logs-refresh-interval');
    const interval = parseInt(intervalSelect?.value || 5000);
    
    refreshIntervals.logs = setInterval(loadLogs, interval);
  }

  function stopLogsAutoRefresh() {
    if (refreshIntervals.logs) {
      clearInterval(refreshIntervals.logs);
      refreshIntervals.logs = null;
    }
  }

  async function loadLogs() {
    try {
      const levelFilter = document.getElementById('logs-level-filter')?.value || '';
      const limit = document.getElementById('logs-limit')?.value || '100';
      
      let url = `/api/deltadore_tydom/logs?limit=${limit}`;
      if (currentEntryId) url += `&entry_id=${currentEntryId}`;
      if (levelFilter) url += `&level=${levelFilter}`;
      
      const response = await callAPI('GET', url);
      const data = await response.json();
      
      const logsContent = document.getElementById('logs-content');
      if (logsContent) {
        if (data.logs && data.logs.length > 0) {
          logsContent.innerHTML = data.logs.map(log => {
            const date = new Date(log.timestamp * 1000);
            const dateStr = date.toLocaleString();
            const level = log.level.toLowerCase();
            const message = escapeHtml(log.message);
            return `<span class="log-${level}">[${dateStr}] [${log.level}] ${message}</span>`;
          }).join('\n');
        } else {
          logsContent.textContent = 'Aucun log disponible';
        }
      }
    } catch (error) {
      showError('Erreur lors du chargement des logs: ' + error.message);
    }
  }

  // API helper
  async function callAPI(method, url, data = null) {
    if (!hass) {
      throw new Error('Home Assistant not available');
    }
    
    // Use Home Assistant's callApi if available, otherwise use fetch
    if (hass.callApi) {
      try {
        const response = await hass.callApi(method, url, data);
        return { ok: true, json: async () => response };
      } catch (error) {
        throw new Error(error.message || 'API call failed');
      }
    }
    
    // Fallback to fetch
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (data) {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    
    return response;
  }

  // Utility functions
  function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
  }

  function showError(message) {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => {
        errorEl.style.display = 'none';
      }, 5000);
    }
    console.error(message);
  }

  function showMessage(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.className = `message ${type} show`;
    setTimeout(() => {
      el.classList.remove('show');
    }, 5000);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Expose functions to global scope for inline handlers
  window.showDeviceDetails = showDeviceDetails;
})();


/* Delta Dore Tydom Panel - Lovelace Native Panel */

(function() {
  'use strict';

  // Create panel element that works with Home Assistant's custom panel system
  class TydomPanel extends HTMLElement {
    constructor() {
      super();
      this._hass = null;
      this._activeTab = 0;
      this._instances = [];
      this._currentEntryId = null;
      this._status = null;
      this._devices = [];
      this._config = null;
      this._logs = [];
      this._loading = false;
      this._error = null;
      this._deviceFilter = "";
      this._deviceTypeFilter = "";
      this._selectedDevice = null;
      this._refreshInterval = null;
    }

    set hass(hass) {
      this._hass = hass;
      if (hass && !this._currentEntryId) {
        this._loadInstances();
      }
      if (hass && this._currentEntryId) {
        this._loadData();
      }
      this._updateContent();
    }

    get hass() {
      return this._hass;
    }

    connectedCallback() {
      // Get hass from window
      if (window.customPanel && window.customPanel.hass) {
        this.hass = window.customPanel.hass;
      } else if (window.hassConnection && window.hassConnection.hass) {
        this.hass = window.hassConnection.hass;
      } else if (window.hass) {
        this.hass = window.hass;
      }

      // Listen for hass updates
      if (window.customPanel) {
        const originalSetHass = window.customPanel.setHass;
        if (originalSetHass) {
          window.customPanel.setHass = (hass) => {
            originalSetHass.call(window.customPanel, hass);
            this.hass = hass;
          };
        }
      }

      this._updateContent();
      this._startAutoRefresh();
    }

    disconnectedCallback() {
      this._stopAutoRefresh();
    }

    _startAutoRefresh() {
      this._stopAutoRefresh();
      // Refresh every 30 seconds
      this._refreshInterval = setInterval(() => {
        if (this._currentEntryId && this.hass) {
          this._loadData();
        }
      }, 30000);
    }

    _stopAutoRefresh() {
      if (this._refreshInterval) {
        clearInterval(this._refreshInterval);
        this._refreshInterval = null;
      }
    }

    // Helper methods for creating elements
    _createElement(tag, attributes = {}, children = []) {
      const element = document.createElement(tag);
      for (const [key, value] of Object.entries(attributes)) {
        if (key === 'className') {
          element.className = value;
        } else if (key === 'textContent') {
          element.textContent = value;
        } else if (key === 'innerHTML') {
          element.innerHTML = value;
        } else if (key.startsWith('.')) {
          // Property assignment (e.g., .value, .selected)
          const propName = key.substring(1);
          element[propName] = value;
        } else if (value === '' || value === true) {
          // Boolean attributes - set without value
          element.setAttribute(key, '');
        } else if (value === false || value === null || value === undefined) {
          // Remove attribute if false/null/undefined
          element.removeAttribute(key);
        } else {
          element.setAttribute(key, value);
        }
      }
      children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
          element.appendChild(child);
        }
      });
      return element;
    }

    _createIcon(icon) {
      return this._createElement('ha-icon', { icon: icon });
    }

    _createCard(title, content) {
      const card = this._createElement('ha-card');
      const cardContent = this._createElement('div', { className: 'card-content' });
      if (title) {
        const titleEl = this._createElement('h2');
        titleEl.textContent = title;
        cardContent.appendChild(titleEl);
      }
      if (typeof content === 'string') {
        cardContent.innerHTML = content;
      } else if (content instanceof Node) {
        cardContent.appendChild(content);
      } else if (Array.isArray(content)) {
        content.forEach(item => {
          if (typeof item === 'string') {
            cardContent.innerHTML += item;
          } else if (item instanceof Node) {
            cardContent.appendChild(item);
          }
        });
      }
      card.appendChild(cardContent);
      return card;
    }

    _createSettingsRow(heading, description, value) {
      const row = this._createElement('ha-settings-row');
      const headingSpan = this._createElement('span', { slot: 'heading' });
      headingSpan.textContent = heading;
      row.appendChild(headingSpan);
      
      const descSpan = this._createElement('span', { slot: 'description' });
      descSpan.textContent = description;
      row.appendChild(descSpan);
      
      const valueSpan = this._createElement('span');
      if (typeof value === 'string') {
        valueSpan.innerHTML = value;
      } else if (value instanceof Node) {
        valueSpan.appendChild(value);
      } else {
        valueSpan.textContent = value || 'N/A';
      }
      row.appendChild(valueSpan);
      
      return row;
    }

    _updateContent() {
      // Clear existing content
      this.innerHTML = '';
      
      // Create and append style
      const style = this._createElement('style');
      style.textContent = `
        :host {
          display: block;
          padding: 16px;
          max-width: 1400px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .header h1 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .instance-selector {
          min-width: 200px;
        }
        ha-tabs {
          border-bottom: 1px solid var(--divider-color);
          margin-bottom: 24px;
        }
        .content {
          margin-top: 24px;
        }
        ha-card {
          margin-bottom: 16px;
        }
        .card-content {
          padding: 16px;
        }
        .card-content h2 {
          margin-top: 0;
          margin-bottom: 16px;
        }
        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }
        .status-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--card-background-color);
          border-radius: 4px;
        }
        .status-icon {
          color: var(--success-color);
        }
        .status-icon.offline {
          color: var(--error-color);
        }
        .devices-filters {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .devices-filters ha-textfield,
        .devices-filters ha-select {
          flex: 1;
          min-width: 200px;
        }
        .devices-table {
          width: 100%;
          border-collapse: collapse;
        }
        .devices-table th,
        .devices-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid var(--divider-color);
        }
        .devices-table th {
          font-weight: 500;
          color: var(--primary-text-color);
          background: var(--card-background-color);
        }
        .devices-table tr:hover {
          background: var(--divider-color);
        }
        .loading {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 48px;
        }
        .action-buttons {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }
        .logs-container {
          position: relative;
        }
        .logs-controls {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
          align-items: center;
        }
        .logs-content {
          max-height: 600px;
          overflow: auto;
          background: var(--card-background-color);
          padding: 16px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .log-line {
          margin-bottom: 4px;
        }
        .log-line.error {
          color: var(--error-color);
        }
        .log-line.warning {
          color: var(--warning-color);
        }
        .log-line.info {
          color: var(--info-color);
        }
        .log-line.debug {
          color: var(--secondary-text-color);
        }
        .device-dialog-content {
          padding: 16px;
        }
        .device-detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--divider-color);
        }
        .device-detail-label {
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .device-detail-value {
          color: var(--secondary-text-color);
          word-break: break-word;
        }
        .empty-state {
          text-align: center;
          padding: 48px;
          color: var(--secondary-text-color);
        }
        .empty-state ha-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.5;
        }
      `;
      this.appendChild(style);
      
      // Create header
      const header = this._createElement('div', { className: 'header' });
      const h1 = this._createElement('h1');
      h1.appendChild(this._createIcon('mdi:home-automation'));
      h1.appendChild(document.createTextNode(' Delta Dore Tydom'));
      header.appendChild(h1);
      
      if (this._instances.length > 1) {
        const instanceSelect = this._createElement('ha-select', {
          className: 'instance-selector',
          label: 'Instance',
          id: 'instance-select'
        });
        // Set value property directly for ha-select
        instanceSelect.value = this._currentEntryId || '';
        this._instances.forEach(inst => {
          const item = this._createElement('mwc-list-item', { value: inst.entry_id });
          item.textContent = inst.title || inst.entry_id;
          instanceSelect.appendChild(item);
        });
        header.appendChild(instanceSelect);
      }
      this.appendChild(header);
      
      // Create tabs
      const tabs = this._createElement('ha-tabs', { id: 'tabs' });
      // Set selected property directly for ha-tabs
      tabs.selected = this._activeTab;
      
      const tabData = [
        { icon: 'mdi:information', label: 'Statut' },
        { icon: 'mdi:devices', label: 'Appareils' },
        { icon: 'mdi:cog', label: 'Configuration' },
        { icon: 'mdi:play-circle', label: 'Actions' },
        { icon: 'mdi:file-document', label: 'Logs' }
      ];
      
      tabData.forEach(tab => {
        const paperTab = this._createElement('paper-tab');
        paperTab.appendChild(this._createIcon(tab.icon));
        paperTab.appendChild(document.createTextNode(' ' + tab.label));
        tabs.appendChild(paperTab);
      });
      this.appendChild(tabs);
      
      // Create content container
      const content = this._createElement('div', { className: 'content', id: 'content' });
      const tabContent = this._renderContent();
      if (tabContent) {
        if (typeof tabContent === 'string') {
          content.innerHTML = tabContent;
        } else if (tabContent instanceof DocumentFragment) {
          // For DocumentFragment, append all children
          while (tabContent.firstChild) {
            content.appendChild(tabContent.firstChild);
          }
        } else if (tabContent instanceof Node) {
          content.appendChild(tabContent);
        } else if (Array.isArray(tabContent)) {
          tabContent.forEach(item => {
            if (typeof item === 'string') {
              content.innerHTML += item;
            } else if (item instanceof Node) {
              content.appendChild(item);
            }
          });
        }
      }
      this.appendChild(content);
      
      // Create device dialog if needed
      if (this._selectedDevice) {
        const dialog = this._renderDeviceDialog();
        if (dialog) {
          this.appendChild(dialog);
        }
      }

      // Setup event listeners
      this._setupEventListeners();
    }

    _setupEventListeners() {
      // Instance selector
      const instanceSelect = this.querySelector('#instance-select');
      if (instanceSelect) {
        instanceSelect.addEventListener('change', (e) => {
          this._onInstanceChange(e);
        });
      }

      // Tab selection
      const tabs = this.querySelector('#tabs');
      if (tabs) {
        tabs.addEventListener('iron-activate', (e) => {
          this._onTabChange(e);
        });
      }

      // Device filter
      const searchField = this.querySelector('#device-search');
      if (searchField) {
        searchField.addEventListener('input', (e) => {
          this._deviceFilter = e.target.value.toLowerCase();
          this._updateContent();
        });
      }

      // Device type filter
      const typeFilter = this.querySelector('#device-type-filter');
      if (typeFilter) {
        typeFilter.addEventListener('change', (e) => {
          this._deviceTypeFilter = e.target.value;
          this._updateContent();
        });
      }

      // Action buttons
      const reloadBtn = this.querySelector('#reload-btn');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', () => this._reloadDevices());
      }

      const testBtn = this.querySelector('#test-btn');
      if (testBtn) {
        testBtn.addEventListener('click', () => this._testConnection());
      }

      // Device detail buttons
      const deviceButtons = this.querySelectorAll('[data-device-id]');
      deviceButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const deviceId = e.currentTarget.getAttribute('data-device-id');
          const device = this._devices.find(d => d.device_id === deviceId);
          if (device) {
            this._showDeviceDetails(device);
          }
        });
      });

      // Close dialog
      const closeDialog = this.querySelector('#close-device-dialog');
      if (closeDialog) {
        closeDialog.addEventListener('click', () => {
          this._selectedDevice = null;
          this._updateContent();
        });
      }

      // Logs refresh
      const refreshLogsBtn = this.querySelector('#refresh-logs-btn');
      if (refreshLogsBtn) {
        refreshLogsBtn.addEventListener('click', () => this._loadLogs());
      }
    }

    _onTabChange(e) {
      // Get selected tab index from ha-tabs
      const tabs = e.currentTarget || e.target;
      if (tabs && tabs.selected !== undefined) {
        this._activeTab = parseInt(tabs.selected, 10);
      } else if (e.detail && e.detail.selected !== undefined) {
        this._activeTab = parseInt(e.detail.selected, 10);
      }
      if (this._activeTab === 4) { // Logs tab (index 4)
        this._loadLogs();
      }
      this._updateContent();
    }

    _onInstanceChange(e) {
      const select = e.currentTarget || e.target;
      // Get value from property or attribute
      this._currentEntryId = select.value || select.getAttribute('value') || '';
      this._loadData();
    }

    _renderContent() {
      if (this._loading && !this._status && !this._devices.length) {
        const loadingDiv = this._createElement('div', { className: 'loading' });
        const progress = this._createElement('ha-circular-progress');
        progress.setAttribute('indeterminate', '');
        loadingDiv.appendChild(progress);
        return loadingDiv;
      }

      if (this._error) {
        const alert = this._createElement('ha-alert', {
          'alert-type': 'error',
          title: 'Erreur'
        });
        alert.textContent = this._error;
        return alert;
      }

      switch (this._activeTab) {
        case 0:
          return this._renderStatusTab();
        case 1:
          return this._renderDevicesTab();
        case 2:
          return this._renderConfigTab();
        case 3:
          return this._renderActionsTab();
        case 4:
          return this._renderLogsTab();
        default:
          return null;
      }
    }

    _renderStatusTab() {
      if (!this._status) {
        const card = this._createCard(null, []);
        const emptyState = this._createElement('div', { className: 'empty-state' });
        emptyState.appendChild(this._createIcon('mdi:loading'));
        const p = this._createElement('p');
        p.textContent = 'Chargement des données...';
        emptyState.appendChild(p);
        card.querySelector('.card-content').appendChild(emptyState);
        return card;
      }

      const connected = this._status.connected !== false;
      const hub = this._status.hub || {};
      const stats = this._status.statistics || {};

      const container = document.createDocumentFragment();

      // Connection status card
      const statusCard = this._createCard('État de connexion', []);
      const statusGrid = this._createElement('div', { className: 'status-grid' });
      
      // Connection status item
      const statusItem = this._createElement('div', { className: 'status-item' });
      const statusIcon = this._createIcon(connected ? 'mdi:check-circle' : 'mdi:close-circle');
      statusIcon.className = 'status-icon' + (!connected ? ' offline' : '');
      statusItem.appendChild(statusIcon);
      const statusText = this._createElement('div');
      const statusTitle = this._createElement('div', { style: 'font-weight: 500;' });
      statusTitle.textContent = connected ? 'Connecté' : 'Déconnecté';
      statusText.appendChild(statusTitle);
      const statusSubtitle = this._createElement('div', { style: 'font-size: 12px; color: var(--secondary-text-color);' });
      statusSubtitle.textContent = this._status.online ? 'En ligne' : 'Hors ligne';
      statusText.appendChild(statusSubtitle);
      statusItem.appendChild(statusText);
      statusGrid.appendChild(statusItem);

      // Hub MAC item
      if (hub.mac) {
        const macItem = this._createElement('div', { className: 'status-item' });
        macItem.appendChild(this._createIcon('mdi:router-wireless'));
        const macText = this._createElement('div');
        const macTitle = this._createElement('div', { style: 'font-weight: 500;' });
        macTitle.textContent = 'Hub MAC';
        macText.appendChild(macTitle);
        const macSubtitle = this._createElement('div', { style: 'font-size: 12px; color: var(--secondary-text-color);' });
        macSubtitle.textContent = hub.mac;
        macText.appendChild(macSubtitle);
        macItem.appendChild(macText);
        statusGrid.appendChild(macItem);
      }

      // Host item
      if (hub.host) {
        const hostItem = this._createElement('div', { className: 'status-item' });
        hostItem.appendChild(this._createIcon('mdi:server'));
        const hostText = this._createElement('div');
        const hostTitle = this._createElement('div', { style: 'font-weight: 500;' });
        hostTitle.textContent = 'Host';
        hostText.appendChild(hostTitle);
        const hostSubtitle = this._createElement('div', { style: 'font-size: 12px; color: var(--secondary-text-color);' });
        hostSubtitle.textContent = hub.host;
        hostText.appendChild(hostSubtitle);
        hostItem.appendChild(hostText);
        statusGrid.appendChild(hostItem);
      }

      // Config mode item
      if (this._status.config_mode) {
        const modeItem = this._createElement('div', { className: 'status-item' });
        const modeIconName = this._status.config_mode === 'cloud' ? 'mdi:cloud' : 'mdi:server-network';
        modeItem.appendChild(this._createIcon(modeIconName));
        const modeText = this._createElement('div');
        const modeTitle = this._createElement('div', { style: 'font-weight: 500;' });
        modeTitle.textContent = 'Mode';
        modeText.appendChild(modeTitle);
        const modeSubtitle = this._createElement('div', { style: 'font-size: 12px; color: var(--secondary-text-color);' });
        modeSubtitle.textContent = this._status.config_mode === 'cloud' ? 'Cloud' : 'Manuel';
        modeText.appendChild(modeSubtitle);
        modeItem.appendChild(modeText);
        statusGrid.appendChild(modeItem);
      }

      statusCard.querySelector('.card-content').appendChild(statusGrid);
      container.appendChild(statusCard);

      // Statistics card
      if (stats.total_devices !== undefined) {
        const statsCard = this._createCard('Statistiques', []);
        const statsContent = statsCard.querySelector('.card-content');
        
        statsContent.appendChild(this._createSettingsRow(
          'Nombre d\'appareils',
          'Total des appareils découverts',
          (stats.total_devices || 0).toString()
        ));

        if (stats.total_entities !== undefined) {
          statsContent.appendChild(this._createSettingsRow(
            'Nombre d\'entités',
            'Total des entités Home Assistant créées',
            (stats.total_entities || 0).toString()
          ));
        }

        if (stats.devices_by_type && Object.keys(stats.devices_by_type).length > 0) {
          const devicesByTypeDiv = this._createElement('div', { style: 'margin-top: 16px;' });
          const h3 = this._createElement('h3', { style: 'margin-bottom: 8px;' });
          h3.textContent = 'Appareils par type';
          devicesByTypeDiv.appendChild(h3);
          Object.entries(stats.devices_by_type).forEach(([type, count]) => {
            devicesByTypeDiv.appendChild(this._createSettingsRow(
              type,
              `Nombre d'appareils de type ${type}`,
              count.toString()
            ));
          });
          statsContent.appendChild(devicesByTypeDiv);
        }

        container.appendChild(statsCard);
      }

      return container;
    }

    _renderDevicesTab() {
      const filteredDevices = this._getFilteredDevices();

      if (this._devices.length === 0) {
        const card = this._createCard(null, []);
        const emptyState = this._createElement('div', { className: 'empty-state' });
        emptyState.appendChild(this._createIcon('mdi:devices-off'));
        const p = this._createElement('p');
        p.textContent = 'Aucun appareil trouvé';
        emptyState.appendChild(p);
        card.querySelector('.card-content').appendChild(emptyState);
        return card;
      }

      const card = this._createCard(null, []);
      const cardContent = card.querySelector('.card-content');
      
      // Title
      const title = this._createElement('h2');
      const deviceCount = `${filteredDevices.length}${filteredDevices.length !== this._devices.length ? ` / ${this._devices.length}` : ''}`;
      title.textContent = `Appareils (${deviceCount})`;
      cardContent.appendChild(title);

      // Filters
      const filtersDiv = this._createElement('div', { className: 'devices-filters' });
      
      const searchField = this._createElement('ha-textfield', {
        id: 'device-search',
        label: 'Rechercher',
        placeholder: 'Nom, type ou device ID...',
        icon: 'mdi:magnify'
      });
      // Set value property directly for ha-textfield
      searchField.value = this._deviceFilter;
      filtersDiv.appendChild(searchField);

      const typeFilter = this._createElement('ha-select', {
        id: 'device-type-filter',
        label: 'Type d\'appareil'
      });
      // Set value property directly for ha-select
      typeFilter.value = this._deviceTypeFilter;
      
      const allTypesItem = this._createElement('mwc-list-item', { value: '' });
      allTypesItem.textContent = 'Tous les types';
      typeFilter.appendChild(allTypesItem);
      
      const deviceTypes = [...new Set(this._devices.map(d => d.type))].filter(t => t);
      deviceTypes.forEach(type => {
        const item = this._createElement('mwc-list-item', { value: type });
        item.textContent = type;
        typeFilter.appendChild(item);
      });
      filtersDiv.appendChild(typeFilter);
      
      cardContent.appendChild(filtersDiv);

      // Table
      const table = this._createElement('table', { className: 'devices-table' });
      const thead = this._createElement('thead');
      const headerRow = this._createElement('tr');
      ['Nom', 'Type', 'Device ID', 'Statut', 'Actions'].forEach(headerText => {
        const th = this._createElement('th');
        th.textContent = headerText;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = this._createElement('tbody');
      filteredDevices.forEach(device => {
        const row = this._createElement('tr');
        
        // Name
        const nameCell = this._createElement('td');
        nameCell.textContent = device.name || 'N/A';
        row.appendChild(nameCell);
        
        // Type
        const typeCell = this._createElement('td');
        typeCell.textContent = device.type || 'N/A';
        row.appendChild(typeCell);
        
        // Device ID
        const idCell = this._createElement('td');
        const code = this._createElement('code');
        code.textContent = device.device_id || 'N/A';
        idCell.appendChild(code);
        row.appendChild(idCell);
        
        // Status
        const statusCell = this._createElement('td');
        const statusIcon = this._createIcon(device.available ? 'mdi:check-circle' : 'mdi:close-circle');
        statusIcon.className = 'status-icon' + (!device.available ? ' offline' : '');
        statusIcon.setAttribute('title', device.available ? 'Disponible' : 'Indisponible');
        statusCell.appendChild(statusIcon);
        row.appendChild(statusCell);
        
        // Actions
        const actionsCell = this._createElement('td');
        const infoButton = this._createElement('ha-icon-button', {
          icon: 'mdi:information',
          'data-device-id': device.device_id || '',
          title: 'Voir les détails'
        });
        actionsCell.appendChild(infoButton);
        row.appendChild(actionsCell);
        
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      cardContent.appendChild(table);

      return card;
    }

    _getFilteredDevices() {
      let filtered = [...this._devices];

      // Filter by search
      if (this._deviceFilter) {
        filtered = filtered.filter(device => {
          const searchLower = this._deviceFilter.toLowerCase();
          return (
            (device.name && device.name.toLowerCase().includes(searchLower)) ||
            (device.type && device.type.toLowerCase().includes(searchLower)) ||
            (device.device_id && device.device_id.toLowerCase().includes(searchLower))
          );
        });
      }

      // Filter by type
      if (this._deviceTypeFilter) {
        filtered = filtered.filter(device => device.type === this._deviceTypeFilter);
      }

      return filtered;
    }

    _renderConfigTab() {
      if (!this._config) {
        const card = this._createCard(null, []);
        const emptyState = this._createElement('div', { className: 'empty-state' });
        emptyState.appendChild(this._createIcon('mdi:loading'));
        const p = this._createElement('p');
        p.textContent = 'Chargement de la configuration...';
        emptyState.appendChild(p);
        card.querySelector('.card-content').appendChild(emptyState);
        return card;
      }

      const zones = this._config.zones || {};
      const card = this._createCard('Configuration', []);
      const cardContent = card.querySelector('.card-content');

      cardContent.appendChild(this._createSettingsRow(
        'Zones Home',
        'Zones configurées pour le mode Home',
        zones.home || 'N/A'
      ));

      cardContent.appendChild(this._createSettingsRow(
        'Zones Away',
        'Zones configurées pour le mode Away',
        zones.away || 'N/A'
      ));

      cardContent.appendChild(this._createSettingsRow(
        'Zones Night',
        'Zones configurées pour le mode Night',
        zones.night || 'N/A'
      ));

      const refreshInterval = (this._config.refresh_interval || 'N/A') + ' secondes';
      cardContent.appendChild(this._createSettingsRow(
        'Intervalle de rafraîchissement',
        'Intervalle entre les mises à jour',
        refreshInterval
      ));

      if (this._config.host) {
        cardContent.appendChild(this._createSettingsRow(
          'Host',
          'Adresse du hub Tydom',
          this._config.host
        ));
      }

      if (this._config.mac) {
        const macCode = this._createElement('code');
        macCode.textContent = this._config.mac;
        cardContent.appendChild(this._createSettingsRow(
          'MAC',
          'Adresse MAC du hub',
          macCode
        ));
      }

      return card;
    }

    _renderActionsTab() {
      const card = this._createCard('Actions', []);
      const cardContent = card.querySelector('.card-content');

      const buttonsDiv = this._createElement('div', { className: 'action-buttons' });

      const reloadBtn = this._createElement('ha-button', {
        id: 'reload-btn',
        raised: ''
      });
      if (this._loading) {
        reloadBtn.setAttribute('disabled', '');
      }
      const reloadIcon = this._createIcon('mdi:reload');
      reloadIcon.setAttribute('slot', 'icon');
      reloadBtn.appendChild(reloadIcon);
      reloadBtn.appendChild(document.createTextNode(' Recharger les appareils'));
      buttonsDiv.appendChild(reloadBtn);

      const testBtn = this._createElement('ha-button', {
        id: 'test-btn',
        raised: ''
      });
      if (this._loading) {
        testBtn.setAttribute('disabled', '');
      }
      const testIcon = this._createIcon('mdi:connection');
      testIcon.setAttribute('slot', 'icon');
      testBtn.appendChild(testIcon);
      testBtn.appendChild(document.createTextNode(' Tester la connexion'));
      buttonsDiv.appendChild(testBtn);

      cardContent.appendChild(buttonsDiv);

      if (this._loading) {
        const loadingDiv = this._createElement('div', { style: 'margin-top: 16px;' });
        const progress = this._createElement('ha-circular-progress');
        progress.setAttribute('indeterminate', '');
        loadingDiv.appendChild(progress);
        cardContent.appendChild(loadingDiv);
      }

      return card;
    }

    _renderLogsTab() {
      const card = this._createCard('Logs', []);
      const cardContent = card.querySelector('.card-content');

      const controlsDiv = this._createElement('div', { className: 'logs-controls' });
      
      const refreshBtn = this._createElement('ha-button', {
        id: 'refresh-logs-btn',
        outlined: ''
      });
      const refreshIcon = this._createIcon('mdi:refresh');
      refreshIcon.setAttribute('slot', 'icon');
      refreshBtn.appendChild(refreshIcon);
      refreshBtn.appendChild(document.createTextNode(' Actualiser'));
      controlsDiv.appendChild(refreshBtn);

      const countSpan = this._createElement('span', { style: 'color: var(--secondary-text-color);' });
      countSpan.textContent = `${this._logs.length} lignes`;
      controlsDiv.appendChild(countSpan);
      cardContent.appendChild(controlsDiv);

      const logsContainer = this._createElement('div', { className: 'logs-container' });
      const logsContent = this._createElement('div', { className: 'logs-content' });

      if (this._logs.length === 0) {
        const emptyState = this._createElement('div', { className: 'empty-state' });
        emptyState.appendChild(this._createIcon('mdi:file-document-outline'));
        const p = this._createElement('p');
        p.textContent = 'Aucun log disponible';
        emptyState.appendChild(p);
        logsContent.appendChild(emptyState);
      } else {
        this._logs.forEach(log => {
          const level = this._getLogLevel(log);
          const logLine = this._createElement('div', { className: `log-line ${level}` });
          logLine.textContent = log;
          logsContent.appendChild(logLine);
        });
      }

      logsContainer.appendChild(logsContent);
      cardContent.appendChild(logsContainer);

      return card;
    }

    _renderDeviceDialog() {
      if (!this._selectedDevice) return null;

      const dialog = this._createElement('ha-dialog', {
        id: 'device-dialog',
        open: ''
      });
      dialog.setAttribute('heading', this._selectedDevice.name || 'Détails de l\'appareil');

      const dialogContent = this._createElement('div', { className: 'device-dialog-content' });

      // Name row
      const nameRow = this._createElement('div', { className: 'device-detail-row' });
      const nameLabel = this._createElement('span', { className: 'device-detail-label' });
      nameLabel.textContent = 'Nom';
      nameRow.appendChild(nameLabel);
      const nameValue = this._createElement('span', { className: 'device-detail-value' });
      nameValue.textContent = this._selectedDevice.name || 'N/A';
      nameRow.appendChild(nameValue);
      dialogContent.appendChild(nameRow);

      // Type row
      const typeRow = this._createElement('div', { className: 'device-detail-row' });
      const typeLabel = this._createElement('span', { className: 'device-detail-label' });
      typeLabel.textContent = 'Type';
      typeRow.appendChild(typeLabel);
      const typeValue = this._createElement('span', { className: 'device-detail-value' });
      typeValue.textContent = this._selectedDevice.type || 'N/A';
      typeRow.appendChild(typeValue);
      dialogContent.appendChild(typeRow);

      // Device ID row
      const idRow = this._createElement('div', { className: 'device-detail-row' });
      const idLabel = this._createElement('span', { className: 'device-detail-label' });
      idLabel.textContent = 'Device ID';
      idRow.appendChild(idLabel);
      const idValue = this._createElement('span', { className: 'device-detail-value' });
      const idCode = this._createElement('code');
      idCode.textContent = this._selectedDevice.device_id || 'N/A';
      idValue.appendChild(idCode);
      idRow.appendChild(idValue);
      dialogContent.appendChild(idRow);

      // Status row
      const statusRow = this._createElement('div', { className: 'device-detail-row' });
      const statusLabel = this._createElement('span', { className: 'device-detail-label' });
      statusLabel.textContent = 'Statut';
      statusRow.appendChild(statusLabel);
      const statusValue = this._createElement('span', { className: 'device-detail-value' });
      const statusIcon = this._createIcon(this._selectedDevice.available ? 'mdi:check-circle' : 'mdi:close-circle');
      statusIcon.className = 'status-icon' + (!this._selectedDevice.available ? ' offline' : '');
      statusValue.appendChild(statusIcon);
      statusValue.appendChild(document.createTextNode(' ' + (this._selectedDevice.available ? 'Disponible' : 'Indisponible')));
      statusRow.appendChild(statusValue);
      dialogContent.appendChild(statusRow);

      // Endpoint row
      if (this._selectedDevice.endpoint) {
        const endpointRow = this._createElement('div', { className: 'device-detail-row' });
        const endpointLabel = this._createElement('span', { className: 'device-detail-label' });
        endpointLabel.textContent = 'Endpoint';
        endpointRow.appendChild(endpointLabel);
        const endpointValue = this._createElement('span', { className: 'device-detail-value' });
        const endpointCode = this._createElement('code');
        endpointCode.textContent = this._selectedDevice.endpoint;
        endpointValue.appendChild(endpointCode);
        endpointRow.appendChild(endpointValue);
        dialogContent.appendChild(endpointRow);
      }

      // Metadata
      if (this._selectedDevice.metadata) {
        const metadataDiv = this._createElement('div', { style: 'margin-top: 16px;' });
        const h3 = this._createElement('h3');
        h3.textContent = 'Métadonnées';
        metadataDiv.appendChild(h3);
        const pre = this._createElement('pre', {
          style: 'background: var(--card-background-color); padding: 12px; border-radius: 4px; overflow: auto; max-height: 300px;'
        });
        pre.textContent = JSON.stringify(this._selectedDevice.metadata, null, 2);
        metadataDiv.appendChild(pre);
        dialogContent.appendChild(metadataDiv);
      }

      dialog.appendChild(dialogContent);

      const closeBtn = this._createElement('mwc-button', {
        slot: 'primaryAction',
        id: 'close-device-dialog',
        dialogAction: 'close'
      });
      closeBtn.textContent = 'Fermer';
      dialog.appendChild(closeBtn);

      return dialog;
    }

    _getLogLevel(log) {
      const logLower = log.toLowerCase();
      if (logLower.includes('error')) return 'error';
      if (logLower.includes('warning')) return 'warning';
      if (logLower.includes('info')) return 'info';
      if (logLower.includes('debug')) return 'debug';
      return '';
    }

    _escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    async _loadInstances() {
      if (!this.hass) return;
      
      try {
        const response = await this.hass.callApi("GET", "/api/deltadore_tydom/instances");
        const data = await response.json();
        this._instances = data.instances || [];
        if (this._instances.length > 0 && !this._currentEntryId) {
          this._currentEntryId = this._instances[0].entry_id;
          await this._loadData();
        }
      } catch (error) {
        console.error("Error loading instances:", error);
        this._error = "Erreur lors du chargement des instances";
        this._updateContent();
      }
    }

    async _loadData() {
      if (!this._currentEntryId || !this.hass) return;

      this._loading = true;
      this._error = null;
      this._updateContent();

      try {
        const entryParam = `?entry_id=${this._currentEntryId}`;
        
        const statusResponse = await this.hass.callApi("GET", `/api/deltadore_tydom/status${entryParam}`);
        this._status = await statusResponse.json();

        const devicesResponse = await this.hass.callApi("GET", `/api/deltadore_tydom/devices${entryParam}`);
        const devicesData = await devicesResponse.json();
        this._devices = devicesData.devices || [];

        const configResponse = await this.hass.callApi("GET", `/api/deltadore_tydom/config${entryParam}`);
        this._config = await configResponse.json();
      } catch (error) {
        this._error = error.message || "Erreur lors du chargement des données";
        console.error("Error loading data:", error);
      } finally {
        this._loading = false;
        this._updateContent();
      }
    }

    async _loadLogs() {
      if (!this._currentEntryId || !this.hass) return;

      try {
        const entryParam = `?entry_id=${this._currentEntryId}`;
        const response = await this.hass.callApi("GET", `/api/deltadore_tydom/logs${entryParam}`);
        const data = await response.json();
        this._logs = data.logs || [];
        this._updateContent();
      } catch (error) {
        console.error("Error loading logs:", error);
        this._error = "Erreur lors du chargement des logs";
        this._updateContent();
      }
    }

    async _reloadDevices() {
      if (!this._currentEntryId || !this.hass) return;

      this._loading = true;
      this._error = null;
      this._updateContent();
      try {
        await this.hass.callApi("POST", `/api/deltadore_tydom/actions/reload_devices?entry_id=${this._currentEntryId}`);
        // Wait a bit before reloading data
        setTimeout(() => {
          this._loadData();
        }, 1000);
      } catch (error) {
        this._error = error.message || "Erreur lors du rechargement";
        this._loading = false;
        this._updateContent();
      }
    }

    async _testConnection() {
      if (!this._currentEntryId || !this.hass) return;

      this._loading = true;
      this._error = null;
      this._updateContent();
      try {
        const response = await this.hass.callApi("POST", `/api/deltadore_tydom/actions/test_connection?entry_id=${this._currentEntryId}`);
        const data = await response.json();
        if (data.success) {
          this._error = null;
          // Show success message
          setTimeout(() => {
            this._error = null;
            this._updateContent();
          }, 3000);
        } else {
          this._error = data.message || "Échec du test de connexion";
        }
      } catch (error) {
        this._error = error.message || "Erreur lors du test de connexion";
      } finally {
        this._loading = false;
        this._updateContent();
      }
    }

    _showDeviceDetails(device) {
      this._selectedDevice = device;
      this._updateContent();
    }
  }

  // Register the custom element
  customElements.define("tydom-panel", TydomPanel);

  // Wait for Home Assistant to be ready
  const initPanel = function() {
    // Clear any existing content
    if (document.body) {
      document.body.innerHTML = '';
      const panel = document.createElement("tydom-panel");
      document.body.appendChild(panel);
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPanel);
  } else {
    initPanel();
  }
})();

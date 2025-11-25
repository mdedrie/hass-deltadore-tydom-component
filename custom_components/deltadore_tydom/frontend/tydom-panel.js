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

    _updateContent() {
      this.innerHTML = `
        <style>
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
        </style>
        ${this._instances.length > 1 ? `
          <div class="header">
            <h1>
              <ha-icon icon="mdi:home-automation"></ha-icon>
              Delta Dore Tydom
            </h1>
            <ha-select
              class="instance-selector"
              label="Instance"
              .value="${this._currentEntryId || ''}"
              id="instance-select"
            >
              ${this._instances.map(inst => `
                <mwc-list-item value="${inst.entry_id}">${inst.title || inst.entry_id}</mwc-list-item>
              `).join('')}
            </ha-select>
          </div>
        ` : `
          <div class="header">
            <h1>
              <ha-icon icon="mdi:home-automation"></ha-icon>
              Delta Dore Tydom
            </h1>
          </div>
        `}
        <ha-tabs id="tabs" .selected="${this._activeTab}">
          <paper-tab>
            <ha-icon icon="mdi:information"></ha-icon>
            Statut
          </paper-tab>
          <paper-tab>
            <ha-icon icon="mdi:devices"></ha-icon>
            Appareils
          </paper-tab>
          <paper-tab>
            <ha-icon icon="mdi:cog"></ha-icon>
            Configuration
          </paper-tab>
          <paper-tab>
            <ha-icon icon="mdi:play-circle"></ha-icon>
            Actions
          </paper-tab>
          <paper-tab>
            <ha-icon icon="mdi:file-document"></ha-icon>
            Logs
          </paper-tab>
        </ha-tabs>
        <div class="content" id="content">
          ${this._renderContent()}
        </div>
        ${this._selectedDevice ? this._renderDeviceDialog() : ''}
      `;

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
      this._activeTab = e.detail.selected;
      if (this._activeTab === 3) { // Logs tab
        this._loadLogs();
      }
      this._updateContent();
    }

    _onInstanceChange(e) {
      this._currentEntryId = e.target.value;
      this._loadData();
    }

    _renderContent() {
      if (this._loading && !this._status && !this._devices.length) {
        return '<div class="loading"><ha-circular-progress indeterminate></ha-circular-progress></div>';
      }

      if (this._error) {
        return `<ha-alert alert-type="error" .title="Erreur">${this._escapeHtml(this._error)}</ha-alert>`;
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
          return '';
      }
    }

    _renderStatusTab() {
      if (!this._status) {
        return '<ha-card><div class="card-content"><div class="empty-state"><ha-icon icon="mdi:loading"></ha-icon><p>Chargement des données...</p></div></div></ha-card>';
      }

      const connected = this._status.connected !== false;
      const hub = this._status.hub || {};
      const stats = this._status.statistics || {};

      return `
        <ha-card>
          <div class="card-content">
            <h2>État de connexion</h2>
            <div class="status-grid">
              <div class="status-item">
                <ha-icon icon="mdi:${connected ? "check-circle" : "close-circle"}" class="status-icon ${!connected ? "offline" : ""}"></ha-icon>
                <div>
                  <div style="font-weight: 500;">${connected ? "Connecté" : "Déconnecté"}</div>
                  <div style="font-size: 12px; color: var(--secondary-text-color);">${this._status.online ? "En ligne" : "Hors ligne"}</div>
                </div>
              </div>
              ${hub.mac ? `
                <div class="status-item">
                  <ha-icon icon="mdi:router-wireless"></ha-icon>
                  <div>
                    <div style="font-weight: 500;">Hub MAC</div>
                    <div style="font-size: 12px; color: var(--secondary-text-color);">${hub.mac}</div>
                  </div>
                </div>
              ` : ''}
              ${hub.host ? `
                <div class="status-item">
                  <ha-icon icon="mdi:server"></ha-icon>
                  <div>
                    <div style="font-weight: 500;">Host</div>
                    <div style="font-size: 12px; color: var(--secondary-text-color);">${hub.host}</div>
                  </div>
                </div>
              ` : ''}
              ${this._status.config_mode ? `
                <div class="status-item">
                  <ha-icon icon="mdi:${this._status.config_mode === "cloud" ? "cloud" : "server-network"}"></ha-icon>
                  <div>
                    <div style="font-weight: 500;">Mode</div>
                    <div style="font-size: 12px; color: var(--secondary-text-color);">${this._status.config_mode === "cloud" ? "Cloud" : "Manuel"}</div>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </ha-card>
        ${stats.total_devices !== undefined ? `
          <ha-card>
            <div class="card-content">
              <h2>Statistiques</h2>
              <ha-settings-row>
                <span slot="heading">Nombre d'appareils</span>
                <span slot="description">Total des appareils découverts</span>
                <span>${stats.total_devices || 0}</span>
              </ha-settings-row>
              ${stats.total_entities !== undefined ? `
                <ha-settings-row>
                  <span slot="heading">Nombre d'entités</span>
                  <span slot="description">Total des entités Home Assistant créées</span>
                  <span>${stats.total_entities || 0}</span>
                </ha-settings-row>
              ` : ''}
              ${stats.devices_by_type && Object.keys(stats.devices_by_type).length > 0 ? `
                <div style="margin-top: 16px;">
                  <h3 style="margin-bottom: 8px;">Appareils par type</h3>
                  ${Object.entries(stats.devices_by_type).map(([type, count]) => `
                    <ha-settings-row>
                      <span slot="heading">${type}</span>
                      <span slot="description">Nombre d'appareils de type ${type}</span>
                      <span>${count}</span>
                    </ha-settings-row>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </ha-card>
        ` : ''}
      `;
    }

    _renderDevicesTab() {
      const filteredDevices = this._getFilteredDevices();

      if (this._devices.length === 0) {
        return `
          <ha-card>
            <div class="card-content">
              <div class="empty-state">
                <ha-icon icon="mdi:devices-off"></ha-icon>
                <p>Aucun appareil trouvé</p>
              </div>
            </div>
          </ha-card>
        `;
      }

      return `
        <ha-card>
          <div class="card-content">
            <h2>Appareils (${filteredDevices.length}${filteredDevices.length !== this._devices.length ? ` / ${this._devices.length}` : ''})</h2>
            <div class="devices-filters">
              <ha-textfield
                id="device-search"
                label="Rechercher"
                placeholder="Nom, type ou device ID..."
                .value="${this._deviceFilter}"
                icon="mdi:magnify"
              ></ha-textfield>
              <ha-select
                id="device-type-filter"
                label="Type d'appareil"
                .value="${this._deviceTypeFilter}"
              >
                <mwc-list-item value="">Tous les types</mwc-list-item>
                ${[...new Set(this._devices.map(d => d.type))].filter(t => t).map(type => `
                  <mwc-list-item value="${type}">${type}</mwc-list-item>
                `).join('')}
              </ha-select>
            </div>
            <table class="devices-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Device ID</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filteredDevices.map(device => `
                  <tr>
                    <td>${this._escapeHtml(device.name || "N/A")}</td>
                    <td>${this._escapeHtml(device.type || "N/A")}</td>
                    <td><code>${this._escapeHtml(device.device_id || "N/A")}</code></td>
                    <td>
                      <ha-icon 
                        icon="mdi:${device.available ? "check-circle" : "close-circle"}" 
                        class="status-icon ${!device.available ? "offline" : ""}"
                        title="${device.available ? "Disponible" : "Indisponible"}"
                      ></ha-icon>
                    </td>
                    <td>
                      <ha-icon-button 
                        icon="mdi:information" 
                        data-device-id="${device.device_id || ""}"
                        title="Voir les détails"
                      ></ha-icon-button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </ha-card>
      `;
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
        return '<ha-card><div class="card-content"><div class="empty-state"><ha-icon icon="mdi:loading"></ha-icon><p>Chargement de la configuration...</p></div></div></ha-card>';
      }

      const zones = this._config.zones || {};

      return `
        <ha-card>
          <div class="card-content">
            <h2>Configuration</h2>
            <ha-settings-row>
              <span slot="heading">Zones Home</span>
              <span slot="description">Zones configurées pour le mode Home</span>
              <span>${this._escapeHtml(zones.home || "N/A")}</span>
            </ha-settings-row>
            <ha-settings-row>
              <span slot="heading">Zones Away</span>
              <span slot="description">Zones configurées pour le mode Away</span>
              <span>${this._escapeHtml(zones.away || "N/A")}</span>
            </ha-settings-row>
            <ha-settings-row>
              <span slot="heading">Zones Night</span>
              <span slot="description">Zones configurées pour le mode Night</span>
              <span>${this._escapeHtml(zones.night || "N/A")}</span>
            </ha-settings-row>
            <ha-settings-row>
              <span slot="heading">Intervalle de rafraîchissement</span>
              <span slot="description">Intervalle entre les mises à jour</span>
              <span>${this._config.refresh_interval || "N/A"} secondes</span>
            </ha-settings-row>
            ${this._config.host ? `
              <ha-settings-row>
                <span slot="heading">Host</span>
                <span slot="description">Adresse du hub Tydom</span>
                <span>${this._escapeHtml(this._config.host)}</span>
              </ha-settings-row>
            ` : ''}
            ${this._config.mac ? `
              <ha-settings-row>
                <span slot="heading">MAC</span>
                <span slot="description">Adresse MAC du hub</span>
                <span><code>${this._escapeHtml(this._config.mac)}</code></span>
              </ha-settings-row>
            ` : ''}
          </div>
        </ha-card>
      `;
    }

    _renderActionsTab() {
      return `
        <ha-card>
          <div class="card-content">
            <h2>Actions</h2>
            <div class="action-buttons">
              <ha-button
                id="reload-btn"
                .disabled="${this._loading}"
                raised
              >
                <ha-icon icon="mdi:reload" slot="icon"></ha-icon>
                Recharger les appareils
              </ha-button>
              <ha-button
                id="test-btn"
                .disabled="${this._loading}"
                raised
              >
                <ha-icon icon="mdi:connection" slot="icon"></ha-icon>
                Tester la connexion
              </ha-button>
            </div>
            ${this._loading ? '<div style="margin-top: 16px;"><ha-circular-progress indeterminate></ha-circular-progress></div>' : ''}
          </div>
        </ha-card>
      `;
    }

    _renderLogsTab() {
      return `
        <ha-card>
          <div class="card-content">
            <h2>Logs</h2>
            <div class="logs-controls">
              <ha-button id="refresh-logs-btn" outlined>
                <ha-icon icon="mdi:refresh" slot="icon"></ha-icon>
                Actualiser
              </ha-button>
              <span style="color: var(--secondary-text-color);">${this._logs.length} lignes</span>
            </div>
            <div class="logs-container">
              <div class="logs-content">
                ${this._logs.length === 0 ? '<div class="empty-state"><ha-icon icon="mdi:file-document-outline"></ha-icon><p>Aucun log disponible</p></div>' : this._logs.map(log => {
                  const level = this._getLogLevel(log);
                  return `<div class="log-line ${level}">${this._escapeHtml(log)}</div>`;
                }).join('')}
              </div>
            </div>
          </div>
        </ha-card>
      `;
    }

    _renderDeviceDialog() {
      if (!this._selectedDevice) return '';

      return `
        <ha-dialog
          id="device-dialog"
          open
          .heading="${this._escapeHtml(this._selectedDevice.name || 'Détails de l\'appareil')}"
        >
          <div class="device-dialog-content">
            <div class="device-detail-row">
              <span class="device-detail-label">Nom</span>
              <span class="device-detail-value">${this._escapeHtml(this._selectedDevice.name || "N/A")}</span>
            </div>
            <div class="device-detail-row">
              <span class="device-detail-label">Type</span>
              <span class="device-detail-value">${this._escapeHtml(this._selectedDevice.type || "N/A")}</span>
            </div>
            <div class="device-detail-row">
              <span class="device-detail-label">Device ID</span>
              <span class="device-detail-value"><code>${this._escapeHtml(this._selectedDevice.device_id || "N/A")}</code></span>
            </div>
            <div class="device-detail-row">
              <span class="device-detail-label">Statut</span>
              <span class="device-detail-value">
                <ha-icon icon="mdi:${this._selectedDevice.available ? "check-circle" : "close-circle"}" class="status-icon ${!this._selectedDevice.available ? "offline" : ""}"></ha-icon>
                ${this._selectedDevice.available ? "Disponible" : "Indisponible"}
              </span>
            </div>
            ${this._selectedDevice.endpoint ? `
              <div class="device-detail-row">
                <span class="device-detail-label">Endpoint</span>
                <span class="device-detail-value"><code>${this._escapeHtml(this._selectedDevice.endpoint)}</code></span>
              </div>
            ` : ''}
            ${this._selectedDevice.metadata ? `
              <div style="margin-top: 16px;">
                <h3>Métadonnées</h3>
                <pre style="background: var(--card-background-color); padding: 12px; border-radius: 4px; overflow: auto; max-height: 300px;">${this._escapeHtml(JSON.stringify(this._selectedDevice.metadata, null, 2))}</pre>
              </div>
            ` : ''}
          </div>
          <mwc-button slot="primaryAction" id="close-device-dialog" dialogAction="close">
            Fermer
          </mwc-button>
        </ha-dialog>
      `;
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

/* Delta Dore Tydom Panel - Lovelace Native Panel */

(function() {
  'use strict';

  // Create panel element that works with Home Assistant's custom panel system
  class TydomPanel extends HTMLElement {
    constructor() {
      super();
      this.hass = null;
      this._activeTab = "status";
      this._instances = [];
      this._currentEntryId = null;
      this._status = null;
      this._devices = [];
      this._config = null;
      this._logs = [];
      this._loading = false;
      this._error = null;
    }

    set hass(hass) {
      this._hass = hass;
      if (hass && !this._currentEntryId) {
        this._loadInstances();
        this._loadData();
      }
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
            this._updateContent();
          };
        }
      }

      this._updateContent();
    }

    _updateContent() {
      this.innerHTML = `
        <style>
          :host {
            display: block;
            padding: 16px;
            max-width: 1200px;
            margin: 0 auto;
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
          .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 16px;
            margin-bottom: 16px;
          }
          .status-item {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .status-icon {
            color: var(--success-color);
          }
          .status-icon.offline {
            color: var(--error-color);
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
          }
          .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 48px;
          }
          .error {
            color: var(--error-color);
            padding: 16px;
            background-color: var(--error-background-color);
            border-radius: 4px;
            margin-bottom: 16px;
          }
        </style>
        <ha-tabs id="tabs" .selected="${this._activeTab}">
          <paper-tab>Statut</paper-tab>
          <paper-tab>Appareils</paper-tab>
          <paper-tab>Configuration</paper-tab>
          <paper-tab>Actions</paper-tab>
          <paper-tab>Logs</paper-tab>
        </ha-tabs>
        <div class="content" id="content">
          ${this._renderContent()}
        </div>
      `;

      // Setup tab selection
      const tabs = this.querySelector('#tabs');
      if (tabs) {
        tabs.addEventListener('iron-activate', (ev) => {
          this._activeTab = ev.detail.selected;
          this._updateContent();
        });
      }

      // Setup buttons
      this._setupButtons();
    }

    _renderContent() {
      if (this._loading) {
        return '<div class="loading"><ha-circular-progress indeterminate></ha-circular-progress></div>';
      }

      if (this._error) {
        return `<div class="error">${this._error}</div>`;
      }

      switch (this._activeTab) {
        case "status":
          return this._renderStatusTab();
        case "devices":
          return this._renderDevicesTab();
        case "config":
          return this._renderConfigTab();
        case "actions":
          return this._renderActionsTab();
        case "logs":
          return this._renderLogsTab();
        default:
          return '';
      }
    }

    _renderStatusTab() {
      if (!this._status) {
        return '<ha-card><div class="card-content">Chargement...</div></ha-card>';
      }

      return `
        <ha-card>
          <div class="card-content">
            <h2>État de connexion</h2>
            <div class="status-grid">
              <div class="status-item">
                <ha-icon icon="mdi:${this._status.connected ? "check-circle" : "close-circle"}" class="status-icon ${!this._status.connected ? "offline" : ""}"></ha-icon>
                <span>${this._status.connected ? "Connecté" : "Déconnecté"}</span>
              </div>
              ${this._status.hub ? `
                <div class="status-item">
                  <ha-icon icon="mdi:router-wireless"></ha-icon>
                  <span>Hub: ${this._status.hub.mac || "N/A"}</span>
                </div>
                <div class="status-item">
                  <ha-icon icon="mdi:server"></ha-icon>
                  <span>Host: ${this._status.hub.host || "N/A"}</span>
                </div>
              ` : ""}
            </div>
          </div>
        </ha-card>
        ${this._status.statistics ? `
          <ha-card>
            <div class="card-content">
              <h2>Statistiques</h2>
              <ha-settings-row>
                <span slot="heading">Nombre d'appareils</span>
                <span slot="description">Total des appareils découverts</span>
                <span>${this._status.statistics.total_devices || 0}</span>
              </ha-settings-row>
            </div>
          </ha-card>
        ` : ""}
      `;
    }

    _renderDevicesTab() {
      if (this._devices.length === 0) {
        return '<ha-card><div class="card-content">Aucun appareil trouvé</div></ha-card>';
      }

      const devicesRows = this._devices.map(device => `
        <tr>
          <td>${device.name || "N/A"}</td>
          <td>${device.type || "N/A"}</td>
          <td>${device.device_id || "N/A"}</td>
          <td>
            <ha-icon icon="mdi:${device.available ? "check-circle" : "close-circle"}" class="status-icon ${!device.available ? "offline" : ""}"></ha-icon>
          </td>
          <td>
            <ha-icon-button icon="mdi:information" data-device-id="${device.device_id || ""}"></ha-icon-button>
          </td>
        </tr>
      `).join('');

      return `
        <ha-card>
          <div class="card-content">
            <h2>Appareils (${this._devices.length})</h2>
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
                ${devicesRows}
              </tbody>
            </table>
          </div>
        </ha-card>
      `;
    }

    _renderConfigTab() {
      if (!this._config) {
        return '<ha-card><div class="card-content">Chargement...</div></ha-card>';
      }

      return `
        <ha-card>
          <div class="card-content">
            <h2>Configuration</h2>
            <ha-settings-row>
              <span slot="heading">Zones Home</span>
              <span slot="description">Zones configurées pour le mode Home</span>
              <span>${this._config.zones?.home || "N/A"}</span>
            </ha-settings-row>
            <ha-settings-row>
              <span slot="heading">Zones Away</span>
              <span slot="description">Zones configurées pour le mode Away</span>
              <span>${this._config.zones?.away || "N/A"}</span>
            </ha-settings-row>
            <ha-settings-row>
              <span slot="heading">Zones Night</span>
              <span slot="description">Zones configurées pour le mode Night</span>
              <span>${this._config.zones?.night || "N/A"}</span>
            </ha-settings-row>
            <ha-settings-row>
              <span slot="heading">Intervalle de rafraîchissement</span>
              <span slot="description">Intervalle entre les mises à jour</span>
              <span>${this._config.refresh_interval || "N/A"} secondes</span>
            </ha-settings-row>
          </div>
        </ha-card>
      `;
    }

    _renderActionsTab() {
      return `
        <ha-card>
          <div class="card-content">
            <h2>Actions</h2>
            <ha-button id="reload-btn" .disabled="${this._loading}">
              Recharger les appareils
            </ha-button>
            <ha-button id="test-btn" .disabled="${this._loading}">
              Tester la connexion
            </ha-button>
          </div>
        </ha-card>
      `;
    }

    _renderLogsTab() {
      return `
        <ha-card>
          <div class="card-content">
            <h2>Logs</h2>
            <pre style="max-height: 500px; overflow: auto; background: var(--card-background-color); padding: 16px; border-radius: 4px;">
${this._logs.join("\n")}
            </pre>
          </div>
        </ha-card>
      `;
    }

    _setupButtons() {
      const reloadBtn = this.querySelector('#reload-btn');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', () => this._reloadDevices());
      }

      const testBtn = this.querySelector('#test-btn');
      if (testBtn) {
        testBtn.addEventListener('click', () => this._testConnection());
      }

      // Setup device detail buttons
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
    }

    async _loadInstances() {
      if (!this.hass) return;
      
      try {
        const response = await this.hass.callApi("GET", "/api/deltadore_tydom/instances");
        const data = await response.json();
        this._instances = data.instances || [];
        if (this._instances.length > 0 && !this._currentEntryId) {
          this._currentEntryId = this._instances[0].entry_id;
        }
      } catch (error) {
        console.error("Error loading instances:", error);
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
      }
    }

    async _reloadDevices() {
      if (!this._currentEntryId || !this.hass) return;

      this._loading = true;
      this._updateContent();
      try {
        await this.hass.callApi("POST", `/api/deltadore_tydom/actions/reload_devices?entry_id=${this._currentEntryId}`);
        await this._loadData();
      } catch (error) {
        this._error = error.message || "Erreur lors du rechargement";
        this._loading = false;
        this._updateContent();
      }
    }

    async _testConnection() {
      if (!this._currentEntryId || !this.hass) return;

      this._loading = true;
      this._updateContent();
      try {
        const response = await this.hass.callApi("POST", `/api/deltadore_tydom/actions/test_connection?entry_id=${this._currentEntryId}`);
        const data = await response.json();
        if (data.success) {
          this._error = null;
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
      console.log("Device details:", device);
      // TODO: Implement device details dialog
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

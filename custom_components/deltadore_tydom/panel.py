"""Panel API endpoints for Delta Dore Tydom integration."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from homeassistant.const import CONF_HOST, CONF_MAC, CONF_EMAIL

from .const import (
    DOMAIN,
    LOGGER,
    CONF_ZONES_HOME,
    CONF_ZONES_AWAY,
    CONF_ZONES_NIGHT,
    CONF_REFRESH_INTERVAL,
    CONF_CONFIG_MODE,
    CONF_CLOUD_MODE,
    CONF_MANUAL_MODE,
)
from . import hub


def get_hub_instance(hass: HomeAssistant, entry_id: str | None = None) -> tuple[hub.Hub, str] | None:
    """Get hub instance by entry_id or return first available."""
    if DOMAIN not in hass.data or not hass.data[DOMAIN]:
        return None
    
    hubs = hass.data[DOMAIN]
    
    if entry_id:
        if entry_id in hubs:
            return (hubs[entry_id], entry_id)
        return None
    
    # Return first available hub
    if hubs:
        entry_id = next(iter(hubs.keys()))
        return (hubs[entry_id], entry_id)
    
    return None


def get_all_instances(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    """Get all hub instances with their entry info."""
    instances = {}
    
    if DOMAIN not in hass.data:
        return instances
    
    from homeassistant.config_entries import async_get as async_get_config_entries
    
    for entry_id, tydom_hub in hass.data[DOMAIN].items():
        entry = async_get_config_entries(hass).get(entry_id)
        if entry:
            instances[entry_id] = {
                "entry_id": entry_id,
                "title": entry.title,
                "host": tydom_hub._host,
                "mac": tydom_hub._mac,
            }
    
    return instances


class TydomStatusView(HomeAssistantView):
    """View to handle status requests."""

    url = "/api/deltadore_tydom/status"
    name = "api:deltadore_tydom:status"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        """Get integration status."""
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id")
        
        hub_instance = get_hub_instance(hass, entry_id)
        if not hub_instance:
            return self.json_message(
                "Hub instance not found", status_code=404
            )
        
        tydom_hub, entry_id = hub_instance
        
        # Count devices by type
        devices_by_type = {}
        total_devices = len(tydom_hub.devices)
        total_entities = len(tydom_hub.ha_devices)
        
        for device_id, device in tydom_hub.devices.items():
            device_type = getattr(device, "device_type", "unknown")
            devices_by_type[device_type] = devices_by_type.get(device_type, 0) + 1
        
        # Get entry for additional info
        from homeassistant.config_entries import async_get as async_get_config_entries
        entry = async_get_config_entries(hass).get(entry_id)
        
        config_mode = CONF_MANUAL_MODE
        if entry and CONF_EMAIL in entry.data and entry.data[CONF_EMAIL]:
            config_mode = CONF_CLOUD_MODE
        
        status_data = {
            "entry_id": entry_id,
            "online": getattr(tydom_hub, "online", False),
            "host": tydom_hub._host,
            "mac": tydom_hub._mac,
            "config_mode": config_mode,
            "refresh_interval": str(tydom_hub._refresh_interval // 60) if tydom_hub._refresh_interval > 0 else "0",
            "zones": {
                "home": tydom_hub._zone_home or "",
                "away": tydom_hub._zone_away or "",
                "night": tydom_hub._zone_night or "",
            },
            "statistics": {
                "total_devices": total_devices,
                "total_entities": total_entities,
                "devices_by_type": devices_by_type,
            },
            "ready": tydom_hub.ready(),
        }
        
        return self.json(status_data)


class TydomDevicesView(HomeAssistantView):
    """View to handle devices requests."""

    url = "/api/deltadore_tydom/devices"
    name = "api:deltadore_tydom:devices"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        """Get devices list."""
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id")
        device_type_filter = request.query.get("type")
        search_query = request.query.get("search", "").lower()
        
        hub_instance = get_hub_instance(hass, entry_id)
        if not hub_instance:
            return self.json_message(
                "Hub instance not found", status_code=404
            )
        
        tydom_hub, entry_id = hub_instance
        
        devices_list = []
        
        for device_id, device in tydom_hub.devices.items():
            device_type = getattr(device, "device_type", "unknown")
            device_name = getattr(device, "device_name", "Unknown")
            
            # Apply filters
            if device_type_filter and device_type != device_type_filter:
                continue
            
            if search_query:
                if search_query not in device_name.lower() and search_query not in device_id.lower():
                    continue
            
            # Get device attributes
            device_data = {
                "device_id": device_id,
                "name": device_name,
                "type": device_type,
                "endpoint": getattr(device, "device_endpoint", lambda: None)(),
            }
            
            # Add metadata if available
            if hasattr(device, "_metadata") and device._metadata:
                device_data["metadata"] = device._metadata
            
            # Add HA entity info if available
            if device_id in tydom_hub.ha_devices:
                ha_device = tydom_hub.ha_devices[device_id]
                device_data["ha_entity"] = {
                    "unique_id": getattr(ha_device, "_attr_unique_id", None),
                    "entity_id": getattr(ha_device, "entity_id", None),
                }
            
            devices_list.append(device_data)
        
        return self.json({
            "entry_id": entry_id,
            "devices": devices_list,
            "total": len(devices_list),
        })


class TydomConfigView(HomeAssistantView):
    """View to handle config requests."""

    url = "/api/deltadore_tydom/config"
    name = "api:deltadore_tydom:config"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        """Get configuration."""
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id")
        
        hub_instance = get_hub_instance(hass, entry_id)
        if not hub_instance:
            return self.json_message(
                "Hub instance not found", status_code=404
            )
        
        tydom_hub, entry_id = hub_instance
        
        from homeassistant.config_entries import async_get as async_get_config_entries
        entry = async_get_config_entries(hass).get(entry_id)
        
        if not entry:
            return self.json_message(
                "Config entry not found", status_code=404
            )
        
        config_mode = CONF_MANUAL_MODE
        if CONF_EMAIL in entry.data and entry.data[CONF_EMAIL]:
            config_mode = CONF_CLOUD_MODE
        
        config_data = {
            "entry_id": entry_id,
            "host": entry.data.get(CONF_HOST, ""),
            "mac": entry.data.get(CONF_MAC, ""),
            "config_mode": config_mode,
            "refresh_interval": entry.data.get(CONF_REFRESH_INTERVAL, "30"),
            "zones": {
                "home": entry.data.get(CONF_ZONES_HOME, ""),
                "away": entry.data.get(CONF_ZONES_AWAY, ""),
                "night": entry.data.get(CONF_ZONES_NIGHT, ""),
            },
        }
        
        return self.json(config_data)

    async def post(self, request: web.Request) -> web.Response:
        """Update configuration."""
        hass: HomeAssistant = request.app["hass"]
        
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return self.json_message(
                "Invalid JSON", status_code=400
            )
        
        entry_id = data.get("entry_id")
        if not entry_id:
            return self.json_message(
                "entry_id is required", status_code=400
            )
        
        from homeassistant.config_entries import async_get as async_get_config_entries
        entry = async_get_config_entries(hass).get(entry_id)
        
        if not entry:
            return self.json_message(
                "Config entry not found", status_code=404
            )
        
        # Validate zones format
        zones_regex = re.compile(r"^$|^[0-8](,[0-8]){0,7}$")
        
        updated_data = entry.data.copy()
        
        if "refresh_interval" in data:
            try:
                interval = int(data["refresh_interval"])
                if interval < 1 or interval > 1440:
                    return self.json_message(
                        "refresh_interval must be between 1 and 1440", status_code=400
                    )
                updated_data[CONF_REFRESH_INTERVAL] = str(interval)
            except (ValueError, TypeError):
                return self.json_message(
                    "Invalid refresh_interval", status_code=400
                )
        
        for zone_key, conf_key in [
            ("zones_home", CONF_ZONES_HOME),
            ("zones_away", CONF_ZONES_AWAY),
            ("zones_night", CONF_ZONES_NIGHT),
        ]:
            if zone_key in data:
                zones_value = data[zone_key] or ""
                if zones_value and not zones_regex.match(zones_value):
                    return self.json_message(
                        f"Invalid {zone_key} format", status_code=400
                    )
                updated_data[conf_key] = zones_value
        
        # Update entry
        hass.config_entries.async_update_entry(entry, data=updated_data)
        
        # Update hub config
        hub_instance = get_hub_instance(hass, entry_id)
        if hub_instance:
            tydom_hub, _ = hub_instance
            tydom_hub.update_config(
                updated_data.get(CONF_REFRESH_INTERVAL, "30"),
                updated_data.get(CONF_ZONES_HOME, ""),
                updated_data.get(CONF_ZONES_AWAY, ""),
                updated_data.get(CONF_ZONES_NIGHT, ""),
            )
        
        return self.json({"success": True, "message": "Configuration updated"})


class TydomActionsView(HomeAssistantView):
    """View to handle actions."""

    url = "/api/deltadore_tydom/actions"
    name = "api:deltadore_tydom:actions"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        """Execute action."""
        hass: HomeAssistant = request.app["hass"]
        
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return self.json_message(
                "Invalid JSON", status_code=400
            )
        
        action = data.get("action")
        entry_id = data.get("entry_id")
        
        if not action:
            return self.json_message(
                "action is required", status_code=400
            )
        
        hub_instance = get_hub_instance(hass, entry_id)
        if not hub_instance:
            return self.json_message(
                "Hub instance not found", status_code=404
            )
        
        tydom_hub, entry_id = hub_instance
        
        try:
            if action == "reload_devices":
                await tydom_hub.reload_devices()
                return self.json({
                    "success": True,
                    "message": "Devices reloaded successfully",
                })
            
            elif action == "test_connection":
                await tydom_hub.test_credentials()
                return self.json({
                    "success": True,
                    "message": "Connection test successful",
                })
            
            else:
                return self.json_message(
                    f"Unknown action: {action}", status_code=400
                )
        
        except Exception as e:
            LOGGER.exception("Error executing action %s: %s", action, e)
            return self.json_message(
                f"Error executing action: {str(e)}", status_code=500
            )


class TydomLogsView(HomeAssistantView):
    """View to handle logs requests."""

    url = "/api/deltadore_tydom/logs"
    name = "api:deltadore_tydom:logs"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        """Get logs."""
        hass: HomeAssistant = request.app["hass"]
        
        # Get parameters
        level_filter = request.query.get("level", "").upper()
        limit = int(request.query.get("limit", 100))
        entry_id = request.query.get("entry_id")
        
        # Limit max logs to prevent memory issues
        if limit > 1000:
            limit = 1000
        
        # Get logger for this integration
        logger = logging.getLogger("custom_components.deltadore_tydom")
        
        # Try to get logs from memory handler if available
        logs = []
        
        # Check all handlers for memory handlers
        for handler in logger.handlers:
            if hasattr(handler, "buffer"):
                # This is likely a memory handler
                for record in handler.buffer:
                    # Apply level filter
                    if level_filter and record.levelname != level_filter:
                        continue
                    
                    log_entry = {
                        "timestamp": record.created,
                        "level": record.levelname,
                        "message": record.getMessage(),
                        "name": record.name,
                    }
                    
                    if record.exc_info:
                        import traceback
                        log_entry["exception"] = "".join(
                            traceback.format_exception(*record.exc_info)
                        )
                    
                    logs.append(log_entry)
        
        # If no memory handler, try to get from file (if accessible)
        if not logs:
            # Fallback: return empty or try to read from file
            # Note: Reading log files directly is not recommended in production
            pass
        
        # Sort by timestamp (newest first) and limit
        logs.sort(key=lambda x: x["timestamp"], reverse=True)
        logs = logs[:limit]
        
        return self.json({
            "logs": logs,
            "total": len(logs),
            "level_filter": level_filter or "ALL",
        })


class TydomInstancesView(HomeAssistantView):
    """View to get all instances."""

    url = "/api/deltadore_tydom/instances"
    name = "api:deltadore_tydom:instances"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        """Get all instances."""
        hass: HomeAssistant = request.app["hass"]
        instances = get_all_instances(hass)
        return self.json({"instances": instances})


class TydomPanelView(HomeAssistantView):
    """View to serve the panel HTML."""

    url = "/api/deltadore_tydom/frontend/panel.html"
    name = "api:deltadore_tydom:panel"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        """Serve panel HTML."""
        from pathlib import Path
        
        frontend_path = Path(__file__).parent / "frontend" / "panel.html"
        
        if not frontend_path.exists():
            return web.Response(
                text="Panel HTML not found", status=404
            )
        
        with open(frontend_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        
        return web.Response(
            text=html_content,
            content_type="text/html",
            charset="utf-8",
        )


class TydomStaticView(HomeAssistantView):
    """View to serve static files."""

    requires_auth = True

    def __init__(self, filename: str, content_type: str):
        """Initialize static view."""
        self.filename = filename
        self.content_type = content_type
        self.url = f"/api/deltadore_tydom/frontend/{filename}"
        self.name = f"api:deltadore_tydom:static:{filename}"

    async def get(self, request: web.Request) -> web.Response:
        """Serve static file."""
        from pathlib import Path
        
        frontend_path = Path(__file__).parent / "frontend" / self.filename
        
        if not frontend_path.exists():
            return web.Response(
                text=f"File {self.filename} not found", status=404
            )
        
        with open(frontend_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        return web.Response(
            text=content,
            content_type=self.content_type,
            charset="utf-8",
        )


class TydomPanelLoaderView(HomeAssistantView):
    """View to serve panel-loader.js without authentication.
    
    This file is loaded by Home Assistant in the context of an authenticated panel,
    so it doesn't need its own authentication check.
    """

    url = "/api/deltadore_tydom/frontend/panel-loader.js"
    name = "api:deltadore_tydom:panel-loader"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        """Serve panel-loader.js."""
        from pathlib import Path
        
        frontend_path = Path(__file__).parent / "frontend" / "panel-loader.js"
        
        if not frontend_path.exists():
            return web.Response(
                text="Panel loader not found", status=404
            )
        
        with open(frontend_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        return web.Response(
            text=content,
            content_type="application/javascript",
            charset="utf-8",
        )


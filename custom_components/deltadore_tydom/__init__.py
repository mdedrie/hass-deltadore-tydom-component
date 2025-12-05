"""The Detailed Delta Dore Tydom Push integration."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from homeassistant.const import CONF_HOST, CONF_MAC, CONF_PIN, Platform
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady

from . import hub
from .const import (
    DOMAIN,
    CONF_TYDOM_PASSWORD,
    CONF_ZONES_HOME,
    CONF_ZONES_AWAY,
    CONF_ZONES_NIGHT,
    CONF_REFRESH_INTERVAL,
    LOGGER,
)

# List of platforms to support. There should be a matching .py file for each,
# eg <cover.py> and <sensor.py>
PLATFORMS: list[str] = [
    # Platform.ALARM_CONTROL_PANEL,
    Platform.CLIMATE,
    Platform.COVER,
    Platform.SENSOR,
    Platform.LOCK,
    Platform.LIGHT,
    Platform.UPDATE,
    Platform.ALARM_CONTROL_PANEL,
    Platform.WEATHER,
    Platform.BINARY_SENSOR,
    Platform.SCENE,
    Platform.SWITCH,
    Platform.BUTTON,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.EVENT,
]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Delta Dore Tydom integration."""
    # Enregistrer le service de rechargement une seule fois
    async def handle_reload_devices(call):
        """Handle reload_devices service call."""
        if DOMAIN not in hass.data or not hass.data[DOMAIN]:
            LOGGER.warning("Aucune entrée de configuration Tydom trouvée")
            return
        
        # Recharger toutes les entrées configurées
        LOGGER.info("Démarrage du rechargement de tous les appareils Tydom")
        for entry_id, tydom_hub in hass.data[DOMAIN].items():
            LOGGER.info("Rechargement de l'entrée de configuration: %s", entry_id)
            await tydom_hub.reload_devices()
    
    hass.services.async_register(DOMAIN, "reload_devices", handle_reload_devices)
    
    # Register service for activating scenarios on groups
    async def handle_activate_group_scenario(call):
        """Handle activate_group_scenario service call."""
        entity_id = call.data.get("entity_id")
        scenario_id = call.data.get("scenario_id")
        
        if not entity_id or not scenario_id:
            LOGGER.error("activate_group_scenario requires entity_id and scenario_id")
            return
        
        # Get the entity
        from homeassistant.helpers import entity_registry as er
        entity_registry = er.async_get(hass)
        entity_entry = entity_registry.async_get(entity_id)
        
        if not entity_entry:
            LOGGER.error("Entity %s not found", entity_id)
            return
        
        # Get the hub
        if DOMAIN not in hass.data or not hass.data[DOMAIN]:
            LOGGER.error("No Tydom hub found")
            return
        
        # Find the entity in the hub
        for entry_id, tydom_hub in hass.data[DOMAIN].items():
            if entity_id in tydom_hub.ha_devices:
                ha_device = tydom_hub.ha_devices[entity_id]
                if hasattr(ha_device, "async_activate_scenario"):
                    await ha_device.async_activate_scenario(scenario_id)
                    LOGGER.info("Activated scenario %s on group %s", scenario_id, entity_id)
                    return
        
        LOGGER.error("Group entity %s not found in any hub", entity_id)
    
    hass.services.async_register(DOMAIN, "activate_group_scenario", handle_activate_group_scenario)
    
    # Register service for creating/updating Tydom scenes
    async def handle_create_scene(call):
        """Handle create_scene service call."""
        entity_id = call.data.get("entity_id")
        entities = call.data.get("entities", {})
        
        if not entity_id:
            LOGGER.error("create_scene requires entity_id")
            return
        
        # Get the entity
        from homeassistant.helpers import entity_registry as er
        entity_registry = er.async_get(hass)
        entity_entry = entity_registry.async_get(entity_id)
        
        if not entity_entry:
            LOGGER.error("Entity %s not found", entity_id)
            return
        
        # Check if it's a scene entity from this integration
        if entity_entry.platform != DOMAIN or entity_entry.domain != "scene":
            LOGGER.error("Entity %s is not a Tydom scene", entity_id)
            return
        
        # Get the hub
        if DOMAIN not in hass.data or not hass.data[DOMAIN]:
            LOGGER.error("No Tydom hub found")
            return
        
        # Find the entity in the hub
        for entry_id, tydom_hub in hass.data[DOMAIN].items():
            if entity_id in tydom_hub.ha_devices:
                ha_device = tydom_hub.ha_devices[entity_id]
                if hasattr(ha_device, "async_create"):
                    await ha_device.async_create(entities=entities)
                    LOGGER.info("Scene %s created/updated with %d entities", entity_id, len(entities))
                    return
        
        LOGGER.error("Scene entity %s not found in any hub", entity_id)
    
    hass.services.async_register(DOMAIN, "create_scene", handle_create_scene)
    
    # Panel and API routes removed - no longer needed
    
    return True




async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Delta Dore Tydom from a config entry."""

    entry.async_on_unload(entry.add_update_listener(update_listener))

    # Store an instance of the "connecting" class that does the work of speaking
    # with your actual devices.
    zone_home = entry.data.get(CONF_ZONES_HOME) or ""
    zone_away = entry.data.get(CONF_ZONES_AWAY) or ""
    zone_night = entry.data.get(CONF_ZONES_NIGHT) or ""

    pin = entry.data.get(CONF_PIN) or ""

    refresh_interval = "30"
    if CONF_REFRESH_INTERVAL in entry.data:
        refresh_interval = entry.data[CONF_REFRESH_INTERVAL]

    tydom_hub = hub.Hub(
        hass,
        entry,
        entry.data[CONF_HOST],
        entry.data[CONF_MAC],
        entry.data[CONF_TYDOM_PASSWORD],
        refresh_interval,
        str(zone_home),
        str(zone_away),
        str(zone_night),
        str(pin),
    )
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = tydom_hub

    try:
        connection = await tydom_hub.connect()
        entry.async_create_background_task(
            target=tydom_hub.setup(connection), hass=hass, name="Tydom"
        )
        entry.async_create_background_task(
            target=tydom_hub.ping(), hass=hass, name="Tydom ping"
        )
        entry.async_create_background_task(
            target=tydom_hub.refresh_all(),
            hass=hass,
            name="Tydom refresh all metadata and data",
        )
        entry.async_create_background_task(
            target=tydom_hub.refresh_data_1s(), hass=hass, name="Tydom refresh data 1s"
        )
        entry.async_create_background_task(
            target=tydom_hub.refresh_data(), hass=hass, name="Tydom refresh data"
        )

    except Exception as err:
        raise ConfigEntryNotReady from err

    # This creates each HA object for each platform your device requires.
    # It's done by calling the `async_setup_entry` function in each platform module.
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # This is called when an entry/configured device is to be removed. The class
    # needs to unload itself, and remove callbacks. See the classes for further
    # details
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok


async def update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Update listener."""
    tydom_hub = hass.data[DOMAIN][entry.entry_id]
    tydom_hub.update_config(
        entry.data[CONF_REFRESH_INTERVAL],
        entry.data[CONF_ZONES_HOME],
        entry.data[CONF_ZONES_AWAY],
        entry.data[CONF_ZONES_NIGHT],
    )

# Analyse de l'utilisation des données DeltaDore Tydom

Ce document liste les données capturées depuis la passerelle Tydom et leur utilisation dans le projet.

## Messages capturés

### 1. `/info` - Informations du gateway

**Données disponibles :**
- `productName` - Nom du produit (ex: "TYWELL PRO") ✅ **UTILISÉ**
- `mac` - Adresse MAC ❌ **NON UTILISÉ**
- `config` - Configuration (ex: "prod") ❌ **NON UTILISÉ**
- `bddEmpty` - Base de données vide ❌ **NON UTILISÉ**
- `bddStatus` - Statut de la base de données ❌ **NON UTILISÉ**
- `apiMode` - Mode API activé ❌ **NON UTILISÉ**
- `mainVersionSW` - Version logicielle principale ✅ **UTILISÉ**
- `mainVersionHW` - Version matérielle principale ✅ **UTILISÉ**
- `mainId` - ID principal ❌ **NON UTILISÉ**
- `mainReference` - Référence principale ❌ **NON UTILISÉ**
- `keyVersionSW` - Version logicielle de la clé ✅ **UTILISÉ** (fallback)
- `keyVersionHW` - Version matérielle de la clé ✅ **UTILISÉ** (fallback)
- `keyVersionStack` - Version stack de la clé ❌ **NON UTILISÉ**
- `keyReference` - Référence de la clé ❌ **NON UTILISÉ**
- `zigbeeVersionSW` - Version logicielle Zigbee ❌ **NON UTILISÉ**
- `zigbeeReference` - Référence Zigbee ❌ **NON UTILISÉ**
- `javaVersion` - Version Java ❌ **NON UTILISÉ**
- `oryxVersion` - Version Oryx ❌ **NON UTILISÉ**
- `bootReference` - Référence boot ❌ **NON UTILISÉ**
- `bootVersion` - Version boot ❌ **NON UTILISÉ**
- Fichiers JSON (tailles) - Tailles des fichiers de configuration ❌ **NON UTILISÉ**
- `urlMediation` - URL de médiation ❌ **NON UTILISÉ**
- `pltRegistered` - Plateforme enregistrée ❌ **NON UTILISÉ**
- `updateAvailable` - Mise à jour disponible ✅ **UTILISÉ**
- `passwordEmpty` - Mot de passe vide ❌ **NON UTILISÉ**
- `maintenance` - Informations de maintenance ❌ **NON UTILISÉ**
- `geoloc` - Géolocalisation (longitude, latitude) ❌ **NON UTILISÉ**
- `clock` - Horloge (heure, source, timezone, summerOffset) ❌ **NON UTILISÉ**
- `moments` - Moments/programmes ❌ **NON UTILISÉ**
- `local_claim` - Claim local (status, lastAccess) ❌ **NON UTILISÉ**
- `weather` - Source météo (outTempSrc, weatherSrc) ❌ **NON UTILISÉ**
- `protocols` - Protocoles disponibles (X3D, ZIGBEE, X3DV, PltService, HTTP) ❌ **NON UTILISÉ**

**Utilisation actuelle :**
- Les données sont stockées dans l'objet `Tydom` via `parse_msg_info()`
- Seules `productName`, `mainVersionSW`, `mainVersionHW`, `keyVersionSW`, `keyVersionHW` et `updateAvailable` sont utilisées dans `HATydom`
- Les autres données sont stockées mais non exposées comme attributs ou capteurs

### 2. `/devices/meta` - Métadonnées des devices

**Données disponibles :**
Pour chaque device/endpoint, les métadonnées incluent :
- `name` - Nom de la métadonnée (ex: "positionCmd", "position", "thermicDefect")
- `type` - Type (string, boolean, numeric, hexstring)
- `permission` - Permission (r, w, rw)
- `validity` - Validité (INFINITE, ES_SUPERVISION, SENSOR_SUPERVISION, etc.)
- `enum_values` - Valeurs énumérées (pour les types string)
- `min`, `max`, `step` - Valeurs min/max/step (pour les types numeric)
- `unit` - Unité (degC, %, W/m2, etc.)
- `size` - Taille (pour hexstring)

**Utilisation actuelle :**
- Toutes les métadonnées sont stockées dans `device_metadata[unique_id]`
- Les métadonnées sont passées aux devices lors de leur création via le paramètre `metadata`
- Utilisation limitée :
  - Vérification des `enum_values` pour `levelCmd` (lights)
  - Vérification des `enum_values` pour `thermicLevel` et `comfortMode` (boilers)
  - Détection des capacités de contrôle pour créer des switches automatiquement
- La plupart des métadonnées (type, permission, validity, min, max, step, unit, size) ne sont pas utilisées

### 3. `/devices/cdata` - Données de configuration

**Données disponibles :**
- Données de configuration spécifiques aux devices (ex: Tywatt pour l'énergie)
- Utilisé pour les devices nécessitant un polling (ex: `energyIndex`, `energyInstant`, `energyHisto`, `energyDistrib`)

**Utilisation actuelle :**
- ✅ **UTILISÉ** pour les devices de type "conso" (Tywatt)
- ✅ **UTILISÉ** pour les alarmes (historique des événements)

### 4. `/scenarios/file` - Scénarios

**Données disponibles :**
- `scn` - Liste des scénarios
  - `id` - ID du scénario ✅ **UTILISÉ**
  - `grpAct` - Actions sur groupes ✅ **UTILISÉ**
  - `epAct` - Actions sur endpoints ✅ **UTILISÉ**

**Utilisation actuelle :**
- ✅ Toutes les données sont utilisées pour créer des entités `TydomScene`
- Les métadonnées (nom, type, picto) sont récupérées depuis `/configs/file`

### 5. `/groups/file` - Groupes

**Données disponibles :**
- `groups` - Liste des groupes
  - `id` - ID du groupe ✅ **UTILISÉ**
  - `devices` - Liste des devices dans le groupe ✅ **UTILISÉ**
  - `areas` - Zones ❌ **NON UTILISÉ**

**Utilisation actuelle :**
- ✅ Utilisé pour résoudre les `grpAct` dans les scénarios
- Les groupes sont stockés dans `groups_data` mais ne sont pas exposés comme entités

### 6. `/configs/file` - Configuration complète

**Données disponibles :**
- `version_application` - Version de l'application ❌ **NON UTILISÉ**
- `date` - Date ❌ **NON UTILISÉ**
- `version` - Version ❌ **NON UTILISÉ**
- `os` - OS ❌ **NON UTILISÉ**
- `groups` - Groupes (avec usage, name, etc.) ❌ **NON UTILISÉ** (partiellement)
- `scenarios` - Métadonnées des scénarios ✅ **UTILISÉ**
- `zigbee_networks` - Réseaux Zigbee ❌ **NON UTILISÉ**
- `id_catalog` - ID du catalogue ❌ **NON UTILISÉ**
- `areas` - Zones ❌ **NON UTILISÉ**
- `old_tycam` - Ancien Tycam ❌ **NON UTILISÉ**
- `endpoints` - Endpoints avec noms et types ✅ **UTILISÉ**
- `moments` - Moments/programmes ❌ **NON UTILISÉ**

**Utilisation actuelle :**
- ✅ Les endpoints sont utilisés pour stocker les noms et types d'appareils
- ✅ Les scénarios sont utilisés pour stocker les métadonnées (nom, type, picto)
- Les autres données ne sont pas utilisées

### 7. `/moments/file` - Moments/Programmes

**Données disponibles :**
- `moments` - Liste des moments/programmes

**Utilisation actuelle :**
- ❌ **NON UTILISÉ** - Parsé mais non exposé comme entités
- Pourrait être utilisé pour créer des entités de type "schedule" ou "time-based automation"

## Opportunités d'amélioration

### 1. Exposer plus d'informations du gateway (`/info`)

**Capteurs à ajouter :**
- Statut des protocoles (X3D, ZIGBEE, etc.) - Binary sensors
- Géolocalisation - Device tracker ou sensors
- Horloge (timezone, source) - Sensors
- Statut de la base de données - Binary sensor
- Mode API - Binary sensor
- Informations de maintenance - Binary sensor

**Attributs à ajouter :**
- MAC address
- Versions complètes (Zigbee, Java, Oryx, Boot)
- URL de médiation
- Statut d'enregistrement de la plateforme

### 2. Utiliser les métadonnées des devices

**Améliorations possibles :**
- Exposer les unités (`unit`) dans les capteurs Home Assistant
- Utiliser `min`/`max` pour valider les valeurs avant envoi
- Utiliser `validity` pour déterminer la fréquence de mise à jour
- Exposer les permissions (`permission`) pour indiquer les capacités en lecture/écriture
- Utiliser `size` pour les hexstrings

### 3. Exposer les groupes

**Améliorations possibles :**
- Créer des entités de type "group" pour représenter les groupes Tydom
- Permettre le contrôle des groupes depuis Home Assistant

### 4. Exposer les moments/programmes

**Améliorations possibles :**
- Créer des entités de type "schedule" ou "time-based automation"
- Permettre la gestion des programmes depuis Home Assistant

### 5. Améliorer le script de capture

**Améliorations réalisées :**
- ✅ Gestion du format HTTP chunked pour parser correctement `/info` et `/devices/meta`
- Meilleure gestion des erreurs de parsing
- Messages d'avertissement pour les messages non-JSON

## Résumé

**Données bien utilisées :**
- Endpoints (noms, types) depuis `/configs/file`
- Scénarios depuis `/scenarios/file` et `/configs/file`
- Données des devices depuis `/devices/data`
- Métadonnées de base (enum_values) pour certains devices

**Données partiellement utilisées :**
- Informations du gateway (seulement versions et updateAvailable)
- Métadonnées des devices (seulement enum_values pour quelques cas)

**Données non utilisées :**
- La plupart des informations du gateway (protocoles, géoloc, horloge, etc.)
- La plupart des métadonnées des devices (unités, min/max, validity, etc.)
- Groupes (stockés mais non exposés)
- Moments/programmes (parsés mais non exposés)
- Zones/Areas
- Informations de configuration (version app, date, etc.)

## Recommandations

1. **Priorité haute :** Exposer les unités des capteurs pour améliorer l'affichage dans Home Assistant
2. **Priorité moyenne :** Exposer les statuts des protocoles et la géolocalisation du gateway
3. **Priorité basse :** Exposer les groupes et moments comme entités séparées


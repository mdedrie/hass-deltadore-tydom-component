# Analyse des Opportunités d'Amélioration - Endpoints Tydom

## Résumé Exécutif

D'après l'analyse des endpoints découverts, voici les fonctionnalités et intégrations supplémentaires que nous pourrions implémenter dans le composant Home Assistant.

## 📊 État Actuel des Endpoints

### ✅ Endpoints Disponibles et Fonctionnels (18/19)

| Endpoint | Statut | Utilisation Actuelle | Opportunité |
|----------|--------|---------------------|-------------|
| `/ping` | ✅ | Utilisé | - |
| `/info` | ✅ | Partiel | ⭐ Améliorer |
| `/configs/file` | ✅ | Partiel | ⭐ Améliorer |
| `/configs/gateway/api_mode` | ✅ | Non utilisé | ⭐ Nouveau |
| `/configs/gateway/geoloc` | ✅ | Partiel | ⭐ Améliorer |
| `/configs/gateway/local_claim` | ✅ | Non utilisé | ⭐ Nouveau |
| `/devices/meta` | ✅ | Utilisé | - |
| `/devices/cmeta` | ✅ | Utilisé | - |
| `/devices/data` | ✅ | Utilisé | - |
| `/areas/meta` | ✅ | Non utilisé (vide) | ⏸️ Prêt si besoin |
| `/areas/cmeta` | ✅ | Non utilisé (vide) | ⏸️ Prêt si besoin |
| `/areas/data` | ✅ | Non utilisé (vide) | ⏸️ Prêt si besoin |
| `/scenarios/file` | ✅ | Utilisé | - |
| `/groups/file` | ✅ | Partiel | ⭐ Améliorer |
| `/moments/file` | ✅ | Partiel | ⭐ Améliorer |
| `/refresh/all` | ⚠️ | Utilisé (POST) | ⭐ Tester GET |
| `/historical/events` | ❌ | 404 - Non disponible | - |
| `/firmware/update` | ❌ | 404 - Non disponible | - |

## 🎯 Opportunités d'Amélioration par Priorité

### 🔴 Priorité HAUTE - Fonctionnalités Partiellement Implémentées

#### 1. **Compléter l'implémentation des Moments/Programmes**

**État actuel :**
- ✅ `HAMoment` existe (SwitchEntity)
- ✅ `TydomMoment` existe
- ✅ Parsing de `/moments/file` fonctionne
- ❌ `suspend_moment()` n'est pas implémenté (TODO dans le code)

**Données disponibles :**
```json
{
  "rdv": [],
  "prog": [{
    "id": 0,
    "mon": [], "tue": [], "wed": [], "thu": [],
    "fri": [], "sat": [], "sun": []
  }],
  "event": [{"progId": 0, "rRule": []}],
  "mom": []
}
```

**À implémenter :**
- [ ] Compléter `suspend_moment()` dans `tydom_client.py` (PUT `/moments/{id}`)
- [ ] Exposer les détails des programmes (jours, heures) dans `extra_state_attributes`
- [ ] Créer des entités pour chaque programme si plusieurs programmes existent
- [ ] Ajouter la possibilité de modifier les programmes (si l'API le permet)

**Valeur ajoutée :** Permettre la gestion complète des programmes Tydom depuis Home Assistant.

---

#### 2. **Améliorer l'utilisation des Groupes**

**État actuel :**
- ✅ `HAGroup` existe (ButtonEntity)
- ✅ `TydomGroup` existe
- ✅ Parsing de `/groups/file` fonctionne
- ⚠️ Groupes utilisés uniquement pour résoudre les scénarios

**Données disponibles :**
- Groupes avec `id`, `devices`, `areas` (vide)
- Métadonnées dans `/configs/file` : `usage`, `name`, `group_all`

**À implémenter :**
- [ ] Améliorer `HAGroup` pour permettre le contrôle direct des groupes
- [ ] Exposer la liste des devices dans le groupe via `extra_state_attributes`
- [ ] Créer des services Home Assistant pour contrôler les groupes
- [ ] Utiliser `usage` pour créer des entités spécialisées (groupe de lumières, volets, etc.)

**Valeur ajoutée :** Contrôle direct des groupes Tydom depuis Home Assistant.

---

### 🟡 Priorité MOYENNE - Nouvelles Fonctionnalités

#### 3. **Exposer la Configuration du Gateway**

**Endpoints disponibles :**
- `/configs/gateway/api_mode` - Mode API (GET/PUT)
- `/configs/gateway/geoloc` - Géolocalisation (GET)
- `/configs/gateway/local_claim` - Claim local (GET)

**À implémenter :**

**3.1 API Mode**
- [ ] Créer un switch pour activer/désactiver le mode API
- [ ] Exposer l'état actuel du mode API

**3.2 Géolocalisation**
- [ ] Améliorer les capteurs existants (longitude/latitude)
- [ ] Créer un Device Tracker pour le gateway (si pertinent)
- [ ] Exposer timezone et summerOffset

**3.3 Local Claim**
- [ ] Créer un capteur pour le statut du claim local
- [ ] Exposer `lastAccess` dans les attributs

**Valeur ajoutée :** Meilleure visibilité et contrôle de la configuration du gateway.

---

#### 4. **Améliorer l'Exposition des Informations du Gateway (`/info`)**

**Données disponibles mais non utilisées :**
- Protocoles (X3D, ZIGBEE, X3DV, PltService, HTTP) avec statuts
- Horloge (clock, source, timezone, summerOffset)
- Maintenance (id)
- Versions complètes (Zigbee, Java, Oryx, Boot)
- URL de médiation
- Statut d'enregistrement de la plateforme

**À implémenter :**
- [ ] Créer des Binary Sensors pour chaque protocole (disponible, installé, ready)
- [ ] Créer des capteurs pour l'horloge (source, timezone)
- [ ] Exposer les versions complètes dans les attributs du device
- [ ] Créer un capteur pour l'URL de médiation

**Valeur ajoutée :** Diagnostic et monitoring améliorés du gateway.

---

#### 5. **Tester POST sur `/refresh/all`**

**État actuel :**
- GET retourne 405 (Method Not Allowed)
- POST est utilisé dans le code mais pas testé dans la découverte

**À faire :**
- [ ] Tester POST `/refresh/all` avec le script de découverte
- [ ] Vérifier si d'autres méthodes sont supportées

**Valeur ajoutée :** Confirmation que l'endpoint fonctionne correctement.

---

### 🟢 Priorité BASSE - Améliorations Futures

#### 6. **Support des Areas (quand disponibles)**

**État actuel :**
- ✅ Endpoints disponibles (`/areas/meta`, `/areas/cmeta`, `/areas/data`)
- ❌ Tous retournent des tableaux vides
- ✅ Infrastructure prête dans le code

**À implémenter (quand des areas seront configurées) :**
- [ ] Activer les appels aux endpoints `/areas/*`
- [ ] Parser les données d'areas
- [ ] Créer un mapping `device_id → area_name`
- [ ] Utiliser `suggested_area` dans `DeviceInfo`

**Valeur ajoutée :** Organisation automatique des devices par area dans Home Assistant.

---

#### 7. **Améliorer l'Utilisation des Métadonnées des Devices**

**Données disponibles mais partiellement utilisées :**
- Unités (`unit`) - utilisées partiellement
- Min/Max - utilisées pour validation
- Validity - utilisée pour polling adaptatif
- Permissions - non utilisées
- Size (pour hexstrings) - non utilisées

**À implémenter :**
- [ ] Exposer les permissions (r/w/rw) dans les attributs
- [ ] Utiliser les unités de manière plus systématique
- [ ] Exposer la taille pour les hexstrings

**Valeur ajoutée :** Meilleure compréhension des capacités des devices.

---

## 📋 Plan d'Implémentation Recommandé

### Phase 1 - Compléter les Fonctionnalités Existantes (Priorité HAUTE)

1. **Compléter `suspend_moment()`**
   - Implémenter PUT `/moments/{id}` dans `tydom_client.py`
   - Tester avec un moment réel
   - Documenter l'API

2. **Améliorer les Groupes**
   - Ajouter des services pour contrôler les groupes
   - Exposer les devices dans les attributs
   - Créer des entités spécialisées par usage

### Phase 2 - Nouvelles Fonctionnalités (Priorité MOYENNE)

3. **Configuration du Gateway**
   - Implémenter le switch API mode
   - Améliorer les capteurs de géolocalisation
   - Exposer le local claim

4. **Informations du Gateway**
   - Créer des binary sensors pour les protocoles
   - Exposer l'horloge et les versions
   - Ajouter des attributs de diagnostic

### Phase 3 - Optimisations (Priorité BASSE)

5. **Support des Areas** (quand disponibles)
6. **Amélioration des métadonnées**

---

## 🔍 Endpoints à Tester avec POST/PUT

Le script de découverte a testé uniquement GET. Il serait intéressant de tester :

- `POST /refresh/all` (déjà utilisé mais à confirmer)
- `PUT /moments/{id}` (pour suspend/resume)
- `PUT /configs/gateway/api_mode` (pour activer/désactiver)
- `PUT /groups/{id}` (si supporté pour contrôler les groupes)

---

## 📊 Estimation d'Effort

| Fonctionnalité | Complexité | Effort Estimé | Valeur |
|----------------|------------|---------------|---------|
| Compléter Moments | Moyenne | 2-3h | ⭐⭐⭐ |
| Améliorer Groupes | Moyenne | 3-4h | ⭐⭐⭐ |
| Configuration Gateway | Faible | 2-3h | ⭐⭐ |
| Infos Gateway | Faible | 2-3h | ⭐⭐ |
| Support Areas | Faible | 1-2h | ⭐ (si disponible) |

---

## 🎯 Recommandations Finales

**À implémenter en priorité :**
1. ✅ Compléter `suspend_moment()` - fonctionnalité partiellement implémentée
2. ✅ Améliorer les groupes - déjà exposés mais sous-utilisés
3. ✅ Configuration du gateway - nouvelles fonctionnalités utiles

**À tester :**
- POST/PUT sur les endpoints pour confirmer les méthodes supportées

**À documenter :**
- Les nouvelles fonctionnalités dans le README
- Les services Home Assistant créés


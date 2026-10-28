# Validation fonctionnelle de l'Agent Core

Ce document est généré par l'exécution réelle de `InvestigationEngine` avec les décisions et résultats scriptés. Il valide la mécanique du moteur, pas l'intelligence diagnostique.

Les mesures, réponses et analyses ci-dessous proviennent exclusivement des données de scénario déclarées dans le générateur. Les données d'installation non fournies restent `null`.

Commande de régénération :

```powershell
.\.venv\Scripts\python scripts\generate_validation_report.py
```

## 1. Installation normale / aucune panne

Fixture de décisions : `normal_battery_full.json`.

### État initial

```json
{
  "investigation_id": "validation-normal_battery_full.json",
  "status": "investigating",
  "step_count": 0,
  "max_steps": 20,
  "problem": null,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  },
  "observations": {},
  "evidence": {},
  "verifications": {},
  "measurements": {},
  "pending_action": null,
  "timeline": [],
  "conclusion": null
}
```

### Étape 1

Décision réelle du provider scripté :

```json
{
  "tool_name": "ask_technician",
  "arguments": {
    "distinguishes": [
      "H0",
      "H3"
    ],
    "question": "La batterie indique-t-elle une charge complète ?"
  },
  "reason": "Vérifier si l'arrêt de charge est un fonctionnement normal."
}
```

- Action proposée : `ask_technician`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `finish_investigation`

Résultat scripté fourni au moteur :

```json
{
  "kind": "technician_answer",
  "evidence_id": "answer-full",
  "answer": "Oui, la batterie affiche 100 %.",
  "impacts": [
    {
      "hypothesis_id": "H0",
      "relation": "supporting",
      "strength": "strong"
    },
    {
      "hypothesis_id": "H3",
      "relation": "contradictory",
      "strength": "indicative"
    }
  ]
}
```

Observations réellement créées :

```json
[
  {
    "id": "observation:answer-full",
    "source_type": "technician_answer",
    "source_id": "action-1",
    "statement": "Oui, la batterie affiche 100 %.",
    "value": null,
    "unit": null,
    "certainty": null
  }
]
```

Evidence réellement créées :

```json
[
  {
    "id": "answer-full",
    "observation_id": "observation:answer-full",
    "source_type": "technician_answer",
    "source_id": "action-1",
    "certainty": null
  }
]
```

Changements de statut d'hypothèse :

```json
[
  {
    "hypothesis_id": "H0",
    "from": "unexplored",
    "to": "supported",
    "verification_id": "verification:action-1",
    "evidence_ids": [
      "answer-full"
    ]
  },
  {
    "hypothesis_id": "H3",
    "from": "unexplored",
    "to": "weakened",
    "verification_id": "verification:action-1",
    "evidence_ids": [
      "answer-full"
    ]
  }
]
```

Preuves justifiant ces changements :

```json
[
  {
    "hypothesis_id": "H0",
    "evidence": {
      "id": "answer-full",
      "observation_id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1",
      "certainty": null
    },
    "observation": {
      "id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1",
      "statement": "Oui, la batterie affiche 100 %.",
      "value": null,
      "unit": null,
      "certainty": null
    }
  },
  {
    "hypothesis_id": "H3",
    "evidence": {
      "id": "answer-full",
      "observation_id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1",
      "certainty": null
    },
    "observation": {
      "id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1",
      "statement": "Oui, la batterie affiche 100 %.",
      "value": null,
      "unit": null,
      "certainty": null
    }
  }
]
```

État après l'étape :

```json
{
  "status": "investigating",
  "step_count": 1,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "supported",
      "supporting_evidence_ids": [
        "answer-full"
      ],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "weakened",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": [
        "answer-full"
      ]
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 1,
    "event_type": "decision_recorded",
    "summary": "Vérifier si l'arrêt de charge est un fonctionnement normal.",
    "details": {
      "action_id": "action-1",
      "tool_name": "ask_technician",
      "distinguishes": [
        "H0",
        "H3"
      ]
    }
  },
  {
    "sequence": 2,
    "event_type": "action_requested",
    "summary": "Action externe demandée : ask_technician.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 3,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 4,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis technician_answer.",
    "details": {
      "observation_id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1"
    }
  },
  {
    "sequence": 5,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "answer-full",
      "observation_id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1"
    }
  },
  {
    "sequence": 6,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-1",
      "action_id": "action-1",
      "evidence_ids": [
        "answer-full"
      ]
    }
  },
  {
    "sequence": 7,
    "event_type": "hypothesis_changed",
    "summary": "H0: unexplored -> supported.",
    "details": {
      "hypothesis_id": "H0",
      "from": "unexplored",
      "to": "supported",
      "verification_id": "verification:action-1",
      "evidence_ids": [
        "answer-full"
      ]
    }
  },
  {
    "sequence": 8,
    "event_type": "hypothesis_changed",
    "summary": "H3: unexplored -> weakened.",
    "details": {
      "hypothesis_id": "H3",
      "from": "unexplored",
      "to": "weakened",
      "verification_id": "verification:action-1",
      "evidence_ids": [
        "answer-full"
      ]
    }
  },
  {
    "sequence": 9,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 10,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  }
]
```

### Étape 2

Décision réelle du provider scripté :

```json
{
  "tool_name": "finish_investigation",
  "arguments": {
    "distinguishes": [
      "H0",
      "H3"
    ],
    "outcome": "diagnosed",
    "diagnosis": "Conditions normales : la batterie est pleine.",
    "confidence": 0.92,
    "evidence": [
      "answer-full"
    ],
    "remaining_uncertainties": []
  },
  "reason": "La charge complète observée explique l'arrêt sans panne."
}
```

- Action proposée : `finish_investigation`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `aucune`

Résultat scripté fourni au moteur :

```json
{
  "kind": "none",
  "note": "Aucun résultat externe : action exécutée par le Core ou fin."
}
```

Observations réellement créées :

```json
[]
```

Evidence réellement créées :

```json
[]
```

Changements de statut d'hypothèse :

```json
[]
```

Preuves justifiant ces changements :

```json
[]
```

État après l'étape :

```json
{
  "status": "completed",
  "step_count": 2,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "supported",
      "supporting_evidence_ids": [
        "answer-full"
      ],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "weakened",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": [
        "answer-full"
      ]
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 11,
    "event_type": "decision_recorded",
    "summary": "La charge complète observée explique l'arrêt sans panne.",
    "details": {
      "action_id": "action-2",
      "tool_name": "finish_investigation",
      "distinguishes": [
        "H0",
        "H3"
      ]
    }
  },
  {
    "sequence": 12,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> completed.",
    "details": {
      "from": "investigating",
      "to": "completed"
    }
  }
]
```

### État final

```json
{
  "investigation_id": "validation-normal_battery_full.json",
  "status": "completed",
  "step_count": 2,
  "max_steps": 20,
  "problem": null,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "supported",
      "supporting_evidence_ids": [
        "answer-full"
      ],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "weakened",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": [
        "answer-full"
      ]
    }
  },
  "observations": {
    "observation:answer-full": {
      "id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1",
      "statement": "Oui, la batterie affiche 100 %.",
      "value": null,
      "unit": null,
      "certainty": null
    }
  },
  "evidence": {
    "answer-full": {
      "id": "answer-full",
      "observation_id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1",
      "certainty": null
    }
  },
  "verifications": {
    "verification:action-1": {
      "id": "verification:action-1",
      "action_id": "action-1",
      "distinguishes": [
        "H0",
        "H3"
      ],
      "observation_ids": [
        "observation:answer-full"
      ],
      "evidence_ids": [
        "answer-full"
      ],
      "impacts": [
        {
          "hypothesis_id": "H0",
          "relation": "supporting",
          "strength": "strong"
        },
        {
          "hypothesis_id": "H3",
          "relation": "contradictory",
          "strength": "indicative"
        }
      ]
    }
  },
  "measurements": {},
  "pending_action": null,
  "timeline": [
    {
      "sequence": 1,
      "event_type": "decision_recorded",
      "summary": "Vérifier si l'arrêt de charge est un fonctionnement normal.",
      "details": {
        "action_id": "action-1",
        "tool_name": "ask_technician",
        "distinguishes": [
          "H0",
          "H3"
        ]
      }
    },
    {
      "sequence": 2,
      "event_type": "action_requested",
      "summary": "Action externe demandée : ask_technician.",
      "details": {
        "action_id": "action-1"
      }
    },
    {
      "sequence": 3,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> waiting_for_technician.",
      "details": {
        "from": "investigating",
        "to": "waiting_for_technician"
      }
    },
    {
      "sequence": 4,
      "event_type": "observation_added",
      "summary": "Observation ajoutée depuis technician_answer.",
      "details": {
        "observation_id": "observation:answer-full",
        "source_type": "technician_answer",
        "source_id": "action-1"
      }
    },
    {
      "sequence": 5,
      "event_type": "evidence_added",
      "summary": "Preuve créée par référence à une observation validée.",
      "details": {
        "evidence_id": "answer-full",
        "observation_id": "observation:answer-full",
        "source_type": "technician_answer",
        "source_id": "action-1"
      }
    },
    {
      "sequence": 6,
      "event_type": "verification_recorded",
      "summary": "Résultat d'outil validé et enregistré.",
      "details": {
        "verification_id": "verification:action-1",
        "action_id": "action-1",
        "evidence_ids": [
          "answer-full"
        ]
      }
    },
    {
      "sequence": 7,
      "event_type": "hypothesis_changed",
      "summary": "H0: unexplored -> supported.",
      "details": {
        "hypothesis_id": "H0",
        "from": "unexplored",
        "to": "supported",
        "verification_id": "verification:action-1",
        "evidence_ids": [
          "answer-full"
        ]
      }
    },
    {
      "sequence": 8,
      "event_type": "hypothesis_changed",
      "summary": "H3: unexplored -> weakened.",
      "details": {
        "hypothesis_id": "H3",
        "from": "unexplored",
        "to": "weakened",
        "verification_id": "verification:action-1",
        "evidence_ids": [
          "answer-full"
        ]
      }
    },
    {
      "sequence": 9,
      "event_type": "action_resumed",
      "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
      "details": {
        "action_id": "action-1"
      }
    },
    {
      "sequence": 10,
      "event_type": "status_changed",
      "summary": "Statut : waiting_for_technician -> investigating.",
      "details": {
        "from": "waiting_for_technician",
        "to": "investigating"
      }
    },
    {
      "sequence": 11,
      "event_type": "decision_recorded",
      "summary": "La charge complète observée explique l'arrêt sans panne.",
      "details": {
        "action_id": "action-2",
        "tool_name": "finish_investigation",
        "distinguishes": [
          "H0",
          "H3"
        ]
      }
    },
    {
      "sequence": 12,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> completed.",
      "details": {
        "from": "investigating",
        "to": "completed"
      }
    }
  ],
  "conclusion": {
    "diagnosis": "Conditions normales : la batterie est pleine.",
    "confidence": 0.92,
    "evidence_ids": [
      "answer-full"
    ],
    "remaining_uncertainties": []
  }
}
```

### Timeline complète

```json
[
  {
    "sequence": 1,
    "event_type": "decision_recorded",
    "summary": "Vérifier si l'arrêt de charge est un fonctionnement normal.",
    "details": {
      "action_id": "action-1",
      "tool_name": "ask_technician",
      "distinguishes": [
        "H0",
        "H3"
      ]
    }
  },
  {
    "sequence": 2,
    "event_type": "action_requested",
    "summary": "Action externe demandée : ask_technician.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 3,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 4,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis technician_answer.",
    "details": {
      "observation_id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1"
    }
  },
  {
    "sequence": 5,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "answer-full",
      "observation_id": "observation:answer-full",
      "source_type": "technician_answer",
      "source_id": "action-1"
    }
  },
  {
    "sequence": 6,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-1",
      "action_id": "action-1",
      "evidence_ids": [
        "answer-full"
      ]
    }
  },
  {
    "sequence": 7,
    "event_type": "hypothesis_changed",
    "summary": "H0: unexplored -> supported.",
    "details": {
      "hypothesis_id": "H0",
      "from": "unexplored",
      "to": "supported",
      "verification_id": "verification:action-1",
      "evidence_ids": [
        "answer-full"
      ]
    }
  },
  {
    "sequence": 8,
    "event_type": "hypothesis_changed",
    "summary": "H3: unexplored -> weakened.",
    "details": {
      "hypothesis_id": "H3",
      "from": "unexplored",
      "to": "weakened",
      "verification_id": "verification:action-1",
      "evidence_ids": [
        "answer-full"
      ]
    }
  },
  {
    "sequence": 9,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 10,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  },
  {
    "sequence": 11,
    "event_type": "decision_recorded",
    "summary": "La charge complète observée explique l'arrêt sans panne.",
    "details": {
      "action_id": "action-2",
      "tool_name": "finish_investigation",
      "distinguishes": [
        "H0",
        "H3"
      ]
    }
  },
  {
    "sequence": 12,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> completed.",
    "details": {
      "from": "investigating",
      "to": "completed"
    }
  }
]
```

## 2. Dégradation d'un câble ou d'une connexion

Fixture de décisions : `degraded_cable.json`.

### État initial

```json
{
  "investigation_id": "validation-degraded_cable.json",
  "status": "investigating",
  "step_count": 0,
  "max_steps": 20,
  "problem": null,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  },
  "observations": {},
  "evidence": {},
  "verifications": {},
  "measurements": {},
  "pending_action": null,
  "timeline": [],
  "conclusion": null
}
```

### Étape 1

Décision réelle du provider scripté :

```json
{
  "tool_name": "request_measurement",
  "arguments": {
    "distinguishes": [
      "H1",
      "H2"
    ],
    "measurement_type": "dc_voltage",
    "location": "sortie du champ PV",
    "unit": "V"
  },
  "reason": "Établir la tension disponible avant la chaîne de raccordement."
}
```

- Action proposée : `request_measurement`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `request_measurement`

Résultat scripté fourni au moteur :

```json
{
  "kind": "measurement",
  "measurement_id": "m-array",
  "value": 400.0
}
```

Observations réellement créées :

```json
[
  {
    "id": "observation:m-array",
    "source_type": "measurement",
    "source_id": "m-array",
    "statement": "dc_voltage mesurée à sortie du champ PV",
    "value": 400.0,
    "unit": "V",
    "certainty": null
  }
]
```

Evidence réellement créées :

```json
[
  {
    "id": "m-array",
    "observation_id": "observation:m-array",
    "source_type": "measurement",
    "source_id": "m-array",
    "certainty": null
  }
]
```

Changements de statut d'hypothèse :

```json
[]
```

Preuves justifiant ces changements :

```json
[]
```

État après l'étape :

```json
{
  "status": "investigating",
  "step_count": 1,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 1,
    "event_type": "decision_recorded",
    "summary": "Établir la tension disponible avant la chaîne de raccordement.",
    "details": {
      "action_id": "action-1",
      "tool_name": "request_measurement",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 2,
    "event_type": "action_requested",
    "summary": "Action externe demandée : request_measurement.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 3,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 4,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis measurement.",
    "details": {
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array"
    }
  },
  {
    "sequence": 5,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "m-array",
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array"
    }
  },
  {
    "sequence": 6,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-1",
      "action_id": "action-1",
      "evidence_ids": [
        "m-array"
      ]
    }
  },
  {
    "sequence": 7,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 8,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  }
]
```

### Étape 2

Décision réelle du provider scripté :

```json
{
  "tool_name": "request_measurement",
  "arguments": {
    "distinguishes": [
      "H1",
      "H2"
    ],
    "measurement_type": "dc_voltage",
    "location": "entrée PV de l'onduleur",
    "unit": "V"
  },
  "reason": "Établir la tension reçue après la chaîne de raccordement."
}
```

- Action proposée : `request_measurement`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `compare_measurements`

Résultat scripté fourni au moteur :

```json
{
  "kind": "measurement",
  "measurement_id": "m-inverter",
  "value": 315.0
}
```

Observations réellement créées :

```json
[
  {
    "id": "observation:m-inverter",
    "source_type": "measurement",
    "source_id": "m-inverter",
    "statement": "dc_voltage mesurée à entrée PV de l'onduleur",
    "value": 315.0,
    "unit": "V",
    "certainty": null
  }
]
```

Evidence réellement créées :

```json
[
  {
    "id": "m-inverter",
    "observation_id": "observation:m-inverter",
    "source_type": "measurement",
    "source_id": "m-inverter",
    "certainty": null
  }
]
```

Changements de statut d'hypothèse :

```json
[]
```

Preuves justifiant ces changements :

```json
[]
```

État après l'étape :

```json
{
  "status": "investigating",
  "step_count": 2,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 9,
    "event_type": "decision_recorded",
    "summary": "Établir la tension reçue après la chaîne de raccordement.",
    "details": {
      "action_id": "action-2",
      "tool_name": "request_measurement",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 10,
    "event_type": "action_requested",
    "summary": "Action externe demandée : request_measurement.",
    "details": {
      "action_id": "action-2"
    }
  },
  {
    "sequence": 11,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 12,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis measurement.",
    "details": {
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter"
    }
  },
  {
    "sequence": 13,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "m-inverter",
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter"
    }
  },
  {
    "sequence": 14,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-2",
      "action_id": "action-2",
      "evidence_ids": [
        "m-inverter"
      ]
    }
  },
  {
    "sequence": 15,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-2"
    }
  },
  {
    "sequence": 16,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  }
]
```

### Étape 3

Décision réelle du provider scripté :

```json
{
  "tool_name": "compare_measurements",
  "arguments": {
    "distinguishes": [
      "H1",
      "H2"
    ],
    "measurement_ids": [
      "m-array",
      "m-inverter"
    ],
    "comparison_reason": "Quantifier la chute entre le champ et l'onduleur."
  },
  "reason": "Une chute localisée permet de distinguer le champ de la liaison."
}
```

- Action proposée : `compare_measurements`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `finish_investigation`

Résultat scripté fourni au moteur :

```json
{
  "kind": "verification_impacts",
  "verification_id": "verification:action-3",
  "impacts": [
    {
      "hypothesis_id": "H1",
      "relation": "contradictory",
      "strength": "indicative"
    },
    {
      "hypothesis_id": "H2",
      "relation": "supporting",
      "strength": "strong"
    }
  ]
}
```

Observations réellement créées :

```json
[
  {
    "id": "observation:comparison-3",
    "source_type": "observation",
    "source_id": "action-3",
    "statement": "Comparaison factuelle : m-array=400 V; m-inverter=315 V",
    "value": 85.0,
    "unit": "V",
    "certainty": null
  }
]
```

Evidence réellement créées :

```json
[
  {
    "id": "comparison-3",
    "observation_id": "observation:comparison-3",
    "source_type": "observation",
    "source_id": "action-3",
    "certainty": null
  }
]
```

Changements de statut d'hypothèse :

```json
[
  {
    "hypothesis_id": "H1",
    "from": "unexplored",
    "to": "weakened",
    "verification_id": "verification:action-3",
    "evidence_ids": [
      "comparison-3"
    ]
  },
  {
    "hypothesis_id": "H2",
    "from": "unexplored",
    "to": "supported",
    "verification_id": "verification:action-3",
    "evidence_ids": [
      "comparison-3"
    ]
  }
]
```

Preuves justifiant ces changements :

```json
[
  {
    "hypothesis_id": "H1",
    "evidence": {
      "id": "comparison-3",
      "observation_id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3",
      "certainty": null
    },
    "observation": {
      "id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3",
      "statement": "Comparaison factuelle : m-array=400 V; m-inverter=315 V",
      "value": 85.0,
      "unit": "V",
      "certainty": null
    }
  },
  {
    "hypothesis_id": "H2",
    "evidence": {
      "id": "comparison-3",
      "observation_id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3",
      "certainty": null
    },
    "observation": {
      "id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3",
      "statement": "Comparaison factuelle : m-array=400 V; m-inverter=315 V",
      "value": 85.0,
      "unit": "V",
      "certainty": null
    }
  }
]
```

État après l'étape :

```json
{
  "status": "investigating",
  "step_count": 3,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "weakened",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": [
        "comparison-3"
      ]
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "supported",
      "supporting_evidence_ids": [
        "comparison-3"
      ],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 17,
    "event_type": "decision_recorded",
    "summary": "Une chute localisée permet de distinguer le champ de la liaison.",
    "details": {
      "action_id": "action-3",
      "tool_name": "compare_measurements",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 18,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis observation.",
    "details": {
      "observation_id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3"
    }
  },
  {
    "sequence": 19,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "comparison-3",
      "observation_id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3"
    }
  },
  {
    "sequence": 20,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-3",
      "action_id": "action-3",
      "evidence_ids": [
        "comparison-3"
      ]
    }
  },
  {
    "sequence": 21,
    "event_type": "verification_recorded",
    "summary": "Impacts de vérification validés par le cœur.",
    "details": {
      "verification_id": "verification:action-3",
      "hypothesis_ids": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 22,
    "event_type": "hypothesis_changed",
    "summary": "H1: unexplored -> weakened.",
    "details": {
      "hypothesis_id": "H1",
      "from": "unexplored",
      "to": "weakened",
      "verification_id": "verification:action-3",
      "evidence_ids": [
        "comparison-3"
      ]
    }
  },
  {
    "sequence": 23,
    "event_type": "hypothesis_changed",
    "summary": "H2: unexplored -> supported.",
    "details": {
      "hypothesis_id": "H2",
      "from": "unexplored",
      "to": "supported",
      "verification_id": "verification:action-3",
      "evidence_ids": [
        "comparison-3"
      ]
    }
  }
]
```

### Étape 4

Décision réelle du provider scripté :

```json
{
  "tool_name": "finish_investigation",
  "arguments": {
    "distinguishes": [
      "H1",
      "H2"
    ],
    "outcome": "diagnosed",
    "diagnosis": "Connexion ou câble dégradé entre le champ PV et l'onduleur.",
    "confidence": 0.88,
    "evidence": [
      "m-array",
      "m-inverter",
      "comparison-3"
    ],
    "remaining_uncertainties": [
      "Le point exact de dégradation reste à localiser selon les procédures de sécurité."
    ]
  },
  "reason": "La chute mesurée localise l'anomalie dans la chaîne électrique."
}
```

- Action proposée : `finish_investigation`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `aucune`

Résultat scripté fourni au moteur :

```json
{
  "kind": "none",
  "note": "Aucun résultat externe : action exécutée par le Core ou fin."
}
```

Observations réellement créées :

```json
[]
```

Evidence réellement créées :

```json
[]
```

Changements de statut d'hypothèse :

```json
[]
```

Preuves justifiant ces changements :

```json
[]
```

État après l'étape :

```json
{
  "status": "completed",
  "step_count": 4,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "weakened",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": [
        "comparison-3"
      ]
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "supported",
      "supporting_evidence_ids": [
        "comparison-3"
      ],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 24,
    "event_type": "decision_recorded",
    "summary": "La chute mesurée localise l'anomalie dans la chaîne électrique.",
    "details": {
      "action_id": "action-4",
      "tool_name": "finish_investigation",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 25,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> completed.",
    "details": {
      "from": "investigating",
      "to": "completed"
    }
  }
]
```

### État final

```json
{
  "investigation_id": "validation-degraded_cable.json",
  "status": "completed",
  "step_count": 4,
  "max_steps": 20,
  "problem": null,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "weakened",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": [
        "comparison-3"
      ]
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "supported",
      "supporting_evidence_ids": [
        "comparison-3"
      ],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  },
  "observations": {
    "observation:m-array": {
      "id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array",
      "statement": "dc_voltage mesurée à sortie du champ PV",
      "value": 400.0,
      "unit": "V",
      "certainty": null
    },
    "observation:m-inverter": {
      "id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter",
      "statement": "dc_voltage mesurée à entrée PV de l'onduleur",
      "value": 315.0,
      "unit": "V",
      "certainty": null
    },
    "observation:comparison-3": {
      "id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3",
      "statement": "Comparaison factuelle : m-array=400 V; m-inverter=315 V",
      "value": 85.0,
      "unit": "V",
      "certainty": null
    }
  },
  "evidence": {
    "m-array": {
      "id": "m-array",
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array",
      "certainty": null
    },
    "m-inverter": {
      "id": "m-inverter",
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter",
      "certainty": null
    },
    "comparison-3": {
      "id": "comparison-3",
      "observation_id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3",
      "certainty": null
    }
  },
  "verifications": {
    "verification:action-1": {
      "id": "verification:action-1",
      "action_id": "action-1",
      "distinguishes": [
        "H1",
        "H2"
      ],
      "observation_ids": [
        "observation:m-array"
      ],
      "evidence_ids": [
        "m-array"
      ],
      "impacts": []
    },
    "verification:action-2": {
      "id": "verification:action-2",
      "action_id": "action-2",
      "distinguishes": [
        "H1",
        "H2"
      ],
      "observation_ids": [
        "observation:m-inverter"
      ],
      "evidence_ids": [
        "m-inverter"
      ],
      "impacts": []
    },
    "verification:action-3": {
      "id": "verification:action-3",
      "action_id": "action-3",
      "distinguishes": [
        "H1",
        "H2"
      ],
      "observation_ids": [
        "observation:comparison-3"
      ],
      "evidence_ids": [
        "comparison-3"
      ],
      "impacts": [
        {
          "hypothesis_id": "H1",
          "relation": "contradictory",
          "strength": "indicative"
        },
        {
          "hypothesis_id": "H2",
          "relation": "supporting",
          "strength": "strong"
        }
      ]
    }
  },
  "measurements": {
    "m-array": {
      "id": "m-array",
      "measurement_type": "dc_voltage",
      "location": "sortie du champ PV",
      "value": 400.0,
      "unit": "V",
      "source_id": "action-1"
    },
    "m-inverter": {
      "id": "m-inverter",
      "measurement_type": "dc_voltage",
      "location": "entrée PV de l'onduleur",
      "value": 315.0,
      "unit": "V",
      "source_id": "action-2"
    }
  },
  "pending_action": null,
  "timeline": [
    {
      "sequence": 1,
      "event_type": "decision_recorded",
      "summary": "Établir la tension disponible avant la chaîne de raccordement.",
      "details": {
        "action_id": "action-1",
        "tool_name": "request_measurement",
        "distinguishes": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 2,
      "event_type": "action_requested",
      "summary": "Action externe demandée : request_measurement.",
      "details": {
        "action_id": "action-1"
      }
    },
    {
      "sequence": 3,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> waiting_for_technician.",
      "details": {
        "from": "investigating",
        "to": "waiting_for_technician"
      }
    },
    {
      "sequence": 4,
      "event_type": "observation_added",
      "summary": "Observation ajoutée depuis measurement.",
      "details": {
        "observation_id": "observation:m-array",
        "source_type": "measurement",
        "source_id": "m-array"
      }
    },
    {
      "sequence": 5,
      "event_type": "evidence_added",
      "summary": "Preuve créée par référence à une observation validée.",
      "details": {
        "evidence_id": "m-array",
        "observation_id": "observation:m-array",
        "source_type": "measurement",
        "source_id": "m-array"
      }
    },
    {
      "sequence": 6,
      "event_type": "verification_recorded",
      "summary": "Résultat d'outil validé et enregistré.",
      "details": {
        "verification_id": "verification:action-1",
        "action_id": "action-1",
        "evidence_ids": [
          "m-array"
        ]
      }
    },
    {
      "sequence": 7,
      "event_type": "action_resumed",
      "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
      "details": {
        "action_id": "action-1"
      }
    },
    {
      "sequence": 8,
      "event_type": "status_changed",
      "summary": "Statut : waiting_for_technician -> investigating.",
      "details": {
        "from": "waiting_for_technician",
        "to": "investigating"
      }
    },
    {
      "sequence": 9,
      "event_type": "decision_recorded",
      "summary": "Établir la tension reçue après la chaîne de raccordement.",
      "details": {
        "action_id": "action-2",
        "tool_name": "request_measurement",
        "distinguishes": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 10,
      "event_type": "action_requested",
      "summary": "Action externe demandée : request_measurement.",
      "details": {
        "action_id": "action-2"
      }
    },
    {
      "sequence": 11,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> waiting_for_technician.",
      "details": {
        "from": "investigating",
        "to": "waiting_for_technician"
      }
    },
    {
      "sequence": 12,
      "event_type": "observation_added",
      "summary": "Observation ajoutée depuis measurement.",
      "details": {
        "observation_id": "observation:m-inverter",
        "source_type": "measurement",
        "source_id": "m-inverter"
      }
    },
    {
      "sequence": 13,
      "event_type": "evidence_added",
      "summary": "Preuve créée par référence à une observation validée.",
      "details": {
        "evidence_id": "m-inverter",
        "observation_id": "observation:m-inverter",
        "source_type": "measurement",
        "source_id": "m-inverter"
      }
    },
    {
      "sequence": 14,
      "event_type": "verification_recorded",
      "summary": "Résultat d'outil validé et enregistré.",
      "details": {
        "verification_id": "verification:action-2",
        "action_id": "action-2",
        "evidence_ids": [
          "m-inverter"
        ]
      }
    },
    {
      "sequence": 15,
      "event_type": "action_resumed",
      "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
      "details": {
        "action_id": "action-2"
      }
    },
    {
      "sequence": 16,
      "event_type": "status_changed",
      "summary": "Statut : waiting_for_technician -> investigating.",
      "details": {
        "from": "waiting_for_technician",
        "to": "investigating"
      }
    },
    {
      "sequence": 17,
      "event_type": "decision_recorded",
      "summary": "Une chute localisée permet de distinguer le champ de la liaison.",
      "details": {
        "action_id": "action-3",
        "tool_name": "compare_measurements",
        "distinguishes": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 18,
      "event_type": "observation_added",
      "summary": "Observation ajoutée depuis observation.",
      "details": {
        "observation_id": "observation:comparison-3",
        "source_type": "observation",
        "source_id": "action-3"
      }
    },
    {
      "sequence": 19,
      "event_type": "evidence_added",
      "summary": "Preuve créée par référence à une observation validée.",
      "details": {
        "evidence_id": "comparison-3",
        "observation_id": "observation:comparison-3",
        "source_type": "observation",
        "source_id": "action-3"
      }
    },
    {
      "sequence": 20,
      "event_type": "verification_recorded",
      "summary": "Résultat d'outil validé et enregistré.",
      "details": {
        "verification_id": "verification:action-3",
        "action_id": "action-3",
        "evidence_ids": [
          "comparison-3"
        ]
      }
    },
    {
      "sequence": 21,
      "event_type": "verification_recorded",
      "summary": "Impacts de vérification validés par le cœur.",
      "details": {
        "verification_id": "verification:action-3",
        "hypothesis_ids": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 22,
      "event_type": "hypothesis_changed",
      "summary": "H1: unexplored -> weakened.",
      "details": {
        "hypothesis_id": "H1",
        "from": "unexplored",
        "to": "weakened",
        "verification_id": "verification:action-3",
        "evidence_ids": [
          "comparison-3"
        ]
      }
    },
    {
      "sequence": 23,
      "event_type": "hypothesis_changed",
      "summary": "H2: unexplored -> supported.",
      "details": {
        "hypothesis_id": "H2",
        "from": "unexplored",
        "to": "supported",
        "verification_id": "verification:action-3",
        "evidence_ids": [
          "comparison-3"
        ]
      }
    },
    {
      "sequence": 24,
      "event_type": "decision_recorded",
      "summary": "La chute mesurée localise l'anomalie dans la chaîne électrique.",
      "details": {
        "action_id": "action-4",
        "tool_name": "finish_investigation",
        "distinguishes": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 25,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> completed.",
      "details": {
        "from": "investigating",
        "to": "completed"
      }
    }
  ],
  "conclusion": {
    "diagnosis": "Connexion ou câble dégradé entre le champ PV et l'onduleur.",
    "confidence": 0.88,
    "evidence_ids": [
      "m-array",
      "m-inverter",
      "comparison-3"
    ],
    "remaining_uncertainties": [
      "Le point exact de dégradation reste à localiser selon les procédures de sécurité."
    ]
  }
}
```

### Timeline complète

```json
[
  {
    "sequence": 1,
    "event_type": "decision_recorded",
    "summary": "Établir la tension disponible avant la chaîne de raccordement.",
    "details": {
      "action_id": "action-1",
      "tool_name": "request_measurement",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 2,
    "event_type": "action_requested",
    "summary": "Action externe demandée : request_measurement.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 3,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 4,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis measurement.",
    "details": {
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array"
    }
  },
  {
    "sequence": 5,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "m-array",
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array"
    }
  },
  {
    "sequence": 6,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-1",
      "action_id": "action-1",
      "evidence_ids": [
        "m-array"
      ]
    }
  },
  {
    "sequence": 7,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 8,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  },
  {
    "sequence": 9,
    "event_type": "decision_recorded",
    "summary": "Établir la tension reçue après la chaîne de raccordement.",
    "details": {
      "action_id": "action-2",
      "tool_name": "request_measurement",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 10,
    "event_type": "action_requested",
    "summary": "Action externe demandée : request_measurement.",
    "details": {
      "action_id": "action-2"
    }
  },
  {
    "sequence": 11,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 12,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis measurement.",
    "details": {
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter"
    }
  },
  {
    "sequence": 13,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "m-inverter",
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter"
    }
  },
  {
    "sequence": 14,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-2",
      "action_id": "action-2",
      "evidence_ids": [
        "m-inverter"
      ]
    }
  },
  {
    "sequence": 15,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-2"
    }
  },
  {
    "sequence": 16,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  },
  {
    "sequence": 17,
    "event_type": "decision_recorded",
    "summary": "Une chute localisée permet de distinguer le champ de la liaison.",
    "details": {
      "action_id": "action-3",
      "tool_name": "compare_measurements",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 18,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis observation.",
    "details": {
      "observation_id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3"
    }
  },
  {
    "sequence": 19,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "comparison-3",
      "observation_id": "observation:comparison-3",
      "source_type": "observation",
      "source_id": "action-3"
    }
  },
  {
    "sequence": 20,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-3",
      "action_id": "action-3",
      "evidence_ids": [
        "comparison-3"
      ]
    }
  },
  {
    "sequence": 21,
    "event_type": "verification_recorded",
    "summary": "Impacts de vérification validés par le cœur.",
    "details": {
      "verification_id": "verification:action-3",
      "hypothesis_ids": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 22,
    "event_type": "hypothesis_changed",
    "summary": "H1: unexplored -> weakened.",
    "details": {
      "hypothesis_id": "H1",
      "from": "unexplored",
      "to": "weakened",
      "verification_id": "verification:action-3",
      "evidence_ids": [
        "comparison-3"
      ]
    }
  },
  {
    "sequence": 23,
    "event_type": "hypothesis_changed",
    "summary": "H2: unexplored -> supported.",
    "details": {
      "hypothesis_id": "H2",
      "from": "unexplored",
      "to": "supported",
      "verification_id": "verification:action-3",
      "evidence_ids": [
        "comparison-3"
      ]
    }
  },
  {
    "sequence": 24,
    "event_type": "decision_recorded",
    "summary": "La chute mesurée localise l'anomalie dans la chaîne électrique.",
    "details": {
      "action_id": "action-4",
      "tool_name": "finish_investigation",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 25,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> completed.",
    "details": {
      "from": "investigating",
      "to": "completed"
    }
  }
]
```

## 3. Piège : image suggestive, mesures contradictoires

Fixture de décisions : `dust_photo_measurement_trap.json`.

### État initial

```json
{
  "investigation_id": "validation-dust_photo_measurement_trap.json",
  "status": "investigating",
  "step_count": 0,
  "max_steps": 20,
  "problem": null,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  },
  "observations": {},
  "evidence": {},
  "verifications": {},
  "measurements": {},
  "pending_action": null,
  "timeline": [],
  "conclusion": null
}
```

### Étape 1

Décision réelle du provider scripté :

```json
{
  "tool_name": "analyze_image",
  "arguments": {
    "distinguishes": [
      "H0",
      "H1"
    ],
    "image_id": "panel-photo",
    "focus": "Rechercher des dépôts ou ombrages visibles."
  },
  "reason": "Documenter l'état visuel du champ sans en déduire seul la cause."
}
```

- Action proposée : `analyze_image`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `request_measurement`

Résultat scripté fourni au moteur :

```json
{
  "kind": "image_analysis",
  "evidence_id": "image-dust",
  "statement": "Un dépôt de poussière est visible.",
  "certainty": 0.65,
  "impacts": [
    {
      "hypothesis_id": "H1",
      "relation": "supporting",
      "strength": "indicative"
    }
  ]
}
```

Observations réellement créées :

```json
[
  {
    "id": "observation:image-dust",
    "source_type": "image_analysis",
    "source_id": "panel-photo",
    "statement": "Un dépôt de poussière est visible.",
    "value": null,
    "unit": null,
    "certainty": 0.65
  }
]
```

Evidence réellement créées :

```json
[
  {
    "id": "image-dust",
    "observation_id": "observation:image-dust",
    "source_type": "image_analysis",
    "source_id": "panel-photo",
    "certainty": 0.65
  }
]
```

Changements de statut d'hypothèse :

```json
[
  {
    "hypothesis_id": "H1",
    "from": "unexplored",
    "to": "plausible",
    "verification_id": "verification:action-1",
    "evidence_ids": [
      "image-dust"
    ]
  }
]
```

Preuves justifiant ces changements :

```json
[
  {
    "hypothesis_id": "H1",
    "evidence": {
      "id": "image-dust",
      "observation_id": "observation:image-dust",
      "source_type": "image_analysis",
      "source_id": "panel-photo",
      "certainty": 0.65
    },
    "observation": {
      "id": "observation:image-dust",
      "source_type": "image_analysis",
      "source_id": "panel-photo",
      "statement": "Un dépôt de poussière est visible.",
      "value": null,
      "unit": null,
      "certainty": 0.65
    }
  }
]
```

État après l'étape :

```json
{
  "status": "investigating",
  "step_count": 1,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "plausible",
      "supporting_evidence_ids": [
        "image-dust"
      ],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 1,
    "event_type": "decision_recorded",
    "summary": "Documenter l'état visuel du champ sans en déduire seul la cause.",
    "details": {
      "action_id": "action-1",
      "tool_name": "analyze_image",
      "distinguishes": [
        "H0",
        "H1"
      ]
    }
  },
  {
    "sequence": 2,
    "event_type": "action_requested",
    "summary": "Action externe demandée : analyze_image.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 3,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 4,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis image_analysis.",
    "details": {
      "observation_id": "observation:image-dust",
      "source_type": "image_analysis",
      "source_id": "panel-photo"
    }
  },
  {
    "sequence": 5,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "image-dust",
      "observation_id": "observation:image-dust",
      "source_type": "image_analysis",
      "source_id": "panel-photo"
    }
  },
  {
    "sequence": 6,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-1",
      "action_id": "action-1",
      "evidence_ids": [
        "image-dust"
      ]
    }
  },
  {
    "sequence": 7,
    "event_type": "hypothesis_changed",
    "summary": "H1: unexplored -> plausible.",
    "details": {
      "hypothesis_id": "H1",
      "from": "unexplored",
      "to": "plausible",
      "verification_id": "verification:action-1",
      "evidence_ids": [
        "image-dust"
      ]
    }
  },
  {
    "sequence": 8,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 9,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  }
]
```

### Étape 2

Décision réelle du provider scripté :

```json
{
  "tool_name": "request_measurement",
  "arguments": {
    "distinguishes": [
      "H1",
      "H2"
    ],
    "measurement_type": "dc_voltage",
    "location": "sortie du champ PV",
    "unit": "V"
  },
  "reason": "Vérifier par une mesure l'hypothèse suggérée par l'image."
}
```

- Action proposée : `request_measurement`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `request_measurement`

Résultat scripté fourni au moteur :

```json
{
  "kind": "measurement",
  "measurement_id": "m-array",
  "value": 398.0
}
```

Observations réellement créées :

```json
[
  {
    "id": "observation:m-array",
    "source_type": "measurement",
    "source_id": "m-array",
    "statement": "dc_voltage mesurée à sortie du champ PV",
    "value": 398.0,
    "unit": "V",
    "certainty": null
  }
]
```

Evidence réellement créées :

```json
[
  {
    "id": "m-array",
    "observation_id": "observation:m-array",
    "source_type": "measurement",
    "source_id": "m-array",
    "certainty": null
  }
]
```

Changements de statut d'hypothèse :

```json
[]
```

Preuves justifiant ces changements :

```json
[]
```

État après l'étape :

```json
{
  "status": "investigating",
  "step_count": 2,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "plausible",
      "supporting_evidence_ids": [
        "image-dust"
      ],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 10,
    "event_type": "decision_recorded",
    "summary": "Vérifier par une mesure l'hypothèse suggérée par l'image.",
    "details": {
      "action_id": "action-2",
      "tool_name": "request_measurement",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 11,
    "event_type": "action_requested",
    "summary": "Action externe demandée : request_measurement.",
    "details": {
      "action_id": "action-2"
    }
  },
  {
    "sequence": 12,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 13,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis measurement.",
    "details": {
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array"
    }
  },
  {
    "sequence": 14,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "m-array",
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array"
    }
  },
  {
    "sequence": 15,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-2",
      "action_id": "action-2",
      "evidence_ids": [
        "m-array"
      ]
    }
  },
  {
    "sequence": 16,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-2"
    }
  },
  {
    "sequence": 17,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  }
]
```

### Étape 3

Décision réelle du provider scripté :

```json
{
  "tool_name": "request_measurement",
  "arguments": {
    "distinguishes": [
      "H1",
      "H2"
    ],
    "measurement_type": "dc_voltage",
    "location": "entrée PV de l'onduleur",
    "unit": "V"
  },
  "reason": "Comparer la tension avant et après la liaison électrique."
}
```

- Action proposée : `request_measurement`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `compare_measurements`

Résultat scripté fourni au moteur :

```json
{
  "kind": "measurement",
  "measurement_id": "m-inverter",
  "value": 300.0
}
```

Observations réellement créées :

```json
[
  {
    "id": "observation:m-inverter",
    "source_type": "measurement",
    "source_id": "m-inverter",
    "statement": "dc_voltage mesurée à entrée PV de l'onduleur",
    "value": 300.0,
    "unit": "V",
    "certainty": null
  }
]
```

Evidence réellement créées :

```json
[
  {
    "id": "m-inverter",
    "observation_id": "observation:m-inverter",
    "source_type": "measurement",
    "source_id": "m-inverter",
    "certainty": null
  }
]
```

Changements de statut d'hypothèse :

```json
[]
```

Preuves justifiant ces changements :

```json
[]
```

État après l'étape :

```json
{
  "status": "investigating",
  "step_count": 3,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "plausible",
      "supporting_evidence_ids": [
        "image-dust"
      ],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 18,
    "event_type": "decision_recorded",
    "summary": "Comparer la tension avant et après la liaison électrique.",
    "details": {
      "action_id": "action-3",
      "tool_name": "request_measurement",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 19,
    "event_type": "action_requested",
    "summary": "Action externe demandée : request_measurement.",
    "details": {
      "action_id": "action-3"
    }
  },
  {
    "sequence": 20,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 21,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis measurement.",
    "details": {
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter"
    }
  },
  {
    "sequence": 22,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "m-inverter",
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter"
    }
  },
  {
    "sequence": 23,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-3",
      "action_id": "action-3",
      "evidence_ids": [
        "m-inverter"
      ]
    }
  },
  {
    "sequence": 24,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-3"
    }
  },
  {
    "sequence": 25,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  }
]
```

### Étape 4

Décision réelle du provider scripté :

```json
{
  "tool_name": "compare_measurements",
  "arguments": {
    "distinguishes": [
      "H1",
      "H2"
    ],
    "measurement_ids": [
      "m-array",
      "m-inverter"
    ],
    "comparison_reason": "Tester si la perte apparaît après le champ PV."
  },
  "reason": "Les mesures doivent primer sur une apparence visuelle incertaine."
}
```

- Action proposée : `compare_measurements`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `finish_investigation`

Résultat scripté fourni au moteur :

```json
{
  "kind": "verification_impacts",
  "verification_id": "verification:action-4",
  "impacts": [
    {
      "hypothesis_id": "H1",
      "relation": "contradictory",
      "strength": "indicative"
    },
    {
      "hypothesis_id": "H2",
      "relation": "supporting",
      "strength": "strong"
    }
  ]
}
```

Observations réellement créées :

```json
[
  {
    "id": "observation:comparison-4",
    "source_type": "observation",
    "source_id": "action-4",
    "statement": "Comparaison factuelle : m-array=398 V; m-inverter=300 V",
    "value": 98.0,
    "unit": "V",
    "certainty": null
  }
]
```

Evidence réellement créées :

```json
[
  {
    "id": "comparison-4",
    "observation_id": "observation:comparison-4",
    "source_type": "observation",
    "source_id": "action-4",
    "certainty": null
  }
]
```

Changements de statut d'hypothèse :

```json
[
  {
    "hypothesis_id": "H1",
    "from": "plausible",
    "to": "weakened",
    "verification_id": "verification:action-4",
    "evidence_ids": [
      "comparison-4"
    ]
  },
  {
    "hypothesis_id": "H2",
    "from": "unexplored",
    "to": "supported",
    "verification_id": "verification:action-4",
    "evidence_ids": [
      "comparison-4"
    ]
  }
]
```

Preuves justifiant ces changements :

```json
[
  {
    "hypothesis_id": "H1",
    "evidence": {
      "id": "comparison-4",
      "observation_id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4",
      "certainty": null
    },
    "observation": {
      "id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4",
      "statement": "Comparaison factuelle : m-array=398 V; m-inverter=300 V",
      "value": 98.0,
      "unit": "V",
      "certainty": null
    }
  },
  {
    "hypothesis_id": "H2",
    "evidence": {
      "id": "comparison-4",
      "observation_id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4",
      "certainty": null
    },
    "observation": {
      "id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4",
      "statement": "Comparaison factuelle : m-array=398 V; m-inverter=300 V",
      "value": 98.0,
      "unit": "V",
      "certainty": null
    }
  }
]
```

État après l'étape :

```json
{
  "status": "investigating",
  "step_count": 4,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "weakened",
      "supporting_evidence_ids": [
        "image-dust"
      ],
      "contradictory_evidence_ids": [
        "comparison-4"
      ]
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "supported",
      "supporting_evidence_ids": [
        "comparison-4"
      ],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 26,
    "event_type": "decision_recorded",
    "summary": "Les mesures doivent primer sur une apparence visuelle incertaine.",
    "details": {
      "action_id": "action-4",
      "tool_name": "compare_measurements",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 27,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis observation.",
    "details": {
      "observation_id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4"
    }
  },
  {
    "sequence": 28,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "comparison-4",
      "observation_id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4"
    }
  },
  {
    "sequence": 29,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-4",
      "action_id": "action-4",
      "evidence_ids": [
        "comparison-4"
      ]
    }
  },
  {
    "sequence": 30,
    "event_type": "verification_recorded",
    "summary": "Impacts de vérification validés par le cœur.",
    "details": {
      "verification_id": "verification:action-4",
      "hypothesis_ids": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 31,
    "event_type": "hypothesis_changed",
    "summary": "H1: plausible -> weakened.",
    "details": {
      "hypothesis_id": "H1",
      "from": "plausible",
      "to": "weakened",
      "verification_id": "verification:action-4",
      "evidence_ids": [
        "comparison-4"
      ]
    }
  },
  {
    "sequence": 32,
    "event_type": "hypothesis_changed",
    "summary": "H2: unexplored -> supported.",
    "details": {
      "hypothesis_id": "H2",
      "from": "unexplored",
      "to": "supported",
      "verification_id": "verification:action-4",
      "evidence_ids": [
        "comparison-4"
      ]
    }
  }
]
```

### Étape 5

Décision réelle du provider scripté :

```json
{
  "tool_name": "finish_investigation",
  "arguments": {
    "distinguishes": [
      "H1",
      "H2"
    ],
    "outcome": "diagnosed",
    "diagnosis": "Anomalie de chaîne électrique malgré la poussière visible.",
    "confidence": 0.86,
    "evidence": [
      "image-dust",
      "m-array",
      "m-inverter",
      "comparison-4"
    ],
    "remaining_uncertainties": [
      "Le composant précis de la liaison reste à localiser en sécurité."
    ]
  },
  "reason": "La chute électrique mesurée contredit l'explication limitée à la poussière."
}
```

- Action proposée : `finish_investigation`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `aucune`

Résultat scripté fourni au moteur :

```json
{
  "kind": "none",
  "note": "Aucun résultat externe : action exécutée par le Core ou fin."
}
```

Observations réellement créées :

```json
[]
```

Evidence réellement créées :

```json
[]
```

Changements de statut d'hypothèse :

```json
[]
```

Preuves justifiant ces changements :

```json
[]
```

État après l'étape :

```json
{
  "status": "completed",
  "step_count": 5,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "weakened",
      "supporting_evidence_ids": [
        "image-dust"
      ],
      "contradictory_evidence_ids": [
        "comparison-4"
      ]
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "supported",
      "supporting_evidence_ids": [
        "comparison-4"
      ],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 33,
    "event_type": "decision_recorded",
    "summary": "La chute électrique mesurée contredit l'explication limitée à la poussière.",
    "details": {
      "action_id": "action-5",
      "tool_name": "finish_investigation",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 34,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> completed.",
    "details": {
      "from": "investigating",
      "to": "completed"
    }
  }
]
```

### État final

```json
{
  "investigation_id": "validation-dust_photo_measurement_trap.json",
  "status": "completed",
  "step_count": 5,
  "max_steps": 20,
  "problem": null,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "weakened",
      "supporting_evidence_ids": [
        "image-dust"
      ],
      "contradictory_evidence_ids": [
        "comparison-4"
      ]
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "supported",
      "supporting_evidence_ids": [
        "comparison-4"
      ],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  },
  "observations": {
    "observation:image-dust": {
      "id": "observation:image-dust",
      "source_type": "image_analysis",
      "source_id": "panel-photo",
      "statement": "Un dépôt de poussière est visible.",
      "value": null,
      "unit": null,
      "certainty": 0.65
    },
    "observation:m-array": {
      "id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array",
      "statement": "dc_voltage mesurée à sortie du champ PV",
      "value": 398.0,
      "unit": "V",
      "certainty": null
    },
    "observation:m-inverter": {
      "id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter",
      "statement": "dc_voltage mesurée à entrée PV de l'onduleur",
      "value": 300.0,
      "unit": "V",
      "certainty": null
    },
    "observation:comparison-4": {
      "id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4",
      "statement": "Comparaison factuelle : m-array=398 V; m-inverter=300 V",
      "value": 98.0,
      "unit": "V",
      "certainty": null
    }
  },
  "evidence": {
    "image-dust": {
      "id": "image-dust",
      "observation_id": "observation:image-dust",
      "source_type": "image_analysis",
      "source_id": "panel-photo",
      "certainty": 0.65
    },
    "m-array": {
      "id": "m-array",
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array",
      "certainty": null
    },
    "m-inverter": {
      "id": "m-inverter",
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter",
      "certainty": null
    },
    "comparison-4": {
      "id": "comparison-4",
      "observation_id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4",
      "certainty": null
    }
  },
  "verifications": {
    "verification:action-1": {
      "id": "verification:action-1",
      "action_id": "action-1",
      "distinguishes": [
        "H0",
        "H1"
      ],
      "observation_ids": [
        "observation:image-dust"
      ],
      "evidence_ids": [
        "image-dust"
      ],
      "impacts": [
        {
          "hypothesis_id": "H1",
          "relation": "supporting",
          "strength": "indicative"
        }
      ]
    },
    "verification:action-2": {
      "id": "verification:action-2",
      "action_id": "action-2",
      "distinguishes": [
        "H1",
        "H2"
      ],
      "observation_ids": [
        "observation:m-array"
      ],
      "evidence_ids": [
        "m-array"
      ],
      "impacts": []
    },
    "verification:action-3": {
      "id": "verification:action-3",
      "action_id": "action-3",
      "distinguishes": [
        "H1",
        "H2"
      ],
      "observation_ids": [
        "observation:m-inverter"
      ],
      "evidence_ids": [
        "m-inverter"
      ],
      "impacts": []
    },
    "verification:action-4": {
      "id": "verification:action-4",
      "action_id": "action-4",
      "distinguishes": [
        "H1",
        "H2"
      ],
      "observation_ids": [
        "observation:comparison-4"
      ],
      "evidence_ids": [
        "comparison-4"
      ],
      "impacts": [
        {
          "hypothesis_id": "H1",
          "relation": "contradictory",
          "strength": "indicative"
        },
        {
          "hypothesis_id": "H2",
          "relation": "supporting",
          "strength": "strong"
        }
      ]
    }
  },
  "measurements": {
    "m-array": {
      "id": "m-array",
      "measurement_type": "dc_voltage",
      "location": "sortie du champ PV",
      "value": 398.0,
      "unit": "V",
      "source_id": "action-2"
    },
    "m-inverter": {
      "id": "m-inverter",
      "measurement_type": "dc_voltage",
      "location": "entrée PV de l'onduleur",
      "value": 300.0,
      "unit": "V",
      "source_id": "action-3"
    }
  },
  "pending_action": null,
  "timeline": [
    {
      "sequence": 1,
      "event_type": "decision_recorded",
      "summary": "Documenter l'état visuel du champ sans en déduire seul la cause.",
      "details": {
        "action_id": "action-1",
        "tool_name": "analyze_image",
        "distinguishes": [
          "H0",
          "H1"
        ]
      }
    },
    {
      "sequence": 2,
      "event_type": "action_requested",
      "summary": "Action externe demandée : analyze_image.",
      "details": {
        "action_id": "action-1"
      }
    },
    {
      "sequence": 3,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> waiting_for_technician.",
      "details": {
        "from": "investigating",
        "to": "waiting_for_technician"
      }
    },
    {
      "sequence": 4,
      "event_type": "observation_added",
      "summary": "Observation ajoutée depuis image_analysis.",
      "details": {
        "observation_id": "observation:image-dust",
        "source_type": "image_analysis",
        "source_id": "panel-photo"
      }
    },
    {
      "sequence": 5,
      "event_type": "evidence_added",
      "summary": "Preuve créée par référence à une observation validée.",
      "details": {
        "evidence_id": "image-dust",
        "observation_id": "observation:image-dust",
        "source_type": "image_analysis",
        "source_id": "panel-photo"
      }
    },
    {
      "sequence": 6,
      "event_type": "verification_recorded",
      "summary": "Résultat d'outil validé et enregistré.",
      "details": {
        "verification_id": "verification:action-1",
        "action_id": "action-1",
        "evidence_ids": [
          "image-dust"
        ]
      }
    },
    {
      "sequence": 7,
      "event_type": "hypothesis_changed",
      "summary": "H1: unexplored -> plausible.",
      "details": {
        "hypothesis_id": "H1",
        "from": "unexplored",
        "to": "plausible",
        "verification_id": "verification:action-1",
        "evidence_ids": [
          "image-dust"
        ]
      }
    },
    {
      "sequence": 8,
      "event_type": "action_resumed",
      "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
      "details": {
        "action_id": "action-1"
      }
    },
    {
      "sequence": 9,
      "event_type": "status_changed",
      "summary": "Statut : waiting_for_technician -> investigating.",
      "details": {
        "from": "waiting_for_technician",
        "to": "investigating"
      }
    },
    {
      "sequence": 10,
      "event_type": "decision_recorded",
      "summary": "Vérifier par une mesure l'hypothèse suggérée par l'image.",
      "details": {
        "action_id": "action-2",
        "tool_name": "request_measurement",
        "distinguishes": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 11,
      "event_type": "action_requested",
      "summary": "Action externe demandée : request_measurement.",
      "details": {
        "action_id": "action-2"
      }
    },
    {
      "sequence": 12,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> waiting_for_technician.",
      "details": {
        "from": "investigating",
        "to": "waiting_for_technician"
      }
    },
    {
      "sequence": 13,
      "event_type": "observation_added",
      "summary": "Observation ajoutée depuis measurement.",
      "details": {
        "observation_id": "observation:m-array",
        "source_type": "measurement",
        "source_id": "m-array"
      }
    },
    {
      "sequence": 14,
      "event_type": "evidence_added",
      "summary": "Preuve créée par référence à une observation validée.",
      "details": {
        "evidence_id": "m-array",
        "observation_id": "observation:m-array",
        "source_type": "measurement",
        "source_id": "m-array"
      }
    },
    {
      "sequence": 15,
      "event_type": "verification_recorded",
      "summary": "Résultat d'outil validé et enregistré.",
      "details": {
        "verification_id": "verification:action-2",
        "action_id": "action-2",
        "evidence_ids": [
          "m-array"
        ]
      }
    },
    {
      "sequence": 16,
      "event_type": "action_resumed",
      "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
      "details": {
        "action_id": "action-2"
      }
    },
    {
      "sequence": 17,
      "event_type": "status_changed",
      "summary": "Statut : waiting_for_technician -> investigating.",
      "details": {
        "from": "waiting_for_technician",
        "to": "investigating"
      }
    },
    {
      "sequence": 18,
      "event_type": "decision_recorded",
      "summary": "Comparer la tension avant et après la liaison électrique.",
      "details": {
        "action_id": "action-3",
        "tool_name": "request_measurement",
        "distinguishes": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 19,
      "event_type": "action_requested",
      "summary": "Action externe demandée : request_measurement.",
      "details": {
        "action_id": "action-3"
      }
    },
    {
      "sequence": 20,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> waiting_for_technician.",
      "details": {
        "from": "investigating",
        "to": "waiting_for_technician"
      }
    },
    {
      "sequence": 21,
      "event_type": "observation_added",
      "summary": "Observation ajoutée depuis measurement.",
      "details": {
        "observation_id": "observation:m-inverter",
        "source_type": "measurement",
        "source_id": "m-inverter"
      }
    },
    {
      "sequence": 22,
      "event_type": "evidence_added",
      "summary": "Preuve créée par référence à une observation validée.",
      "details": {
        "evidence_id": "m-inverter",
        "observation_id": "observation:m-inverter",
        "source_type": "measurement",
        "source_id": "m-inverter"
      }
    },
    {
      "sequence": 23,
      "event_type": "verification_recorded",
      "summary": "Résultat d'outil validé et enregistré.",
      "details": {
        "verification_id": "verification:action-3",
        "action_id": "action-3",
        "evidence_ids": [
          "m-inverter"
        ]
      }
    },
    {
      "sequence": 24,
      "event_type": "action_resumed",
      "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
      "details": {
        "action_id": "action-3"
      }
    },
    {
      "sequence": 25,
      "event_type": "status_changed",
      "summary": "Statut : waiting_for_technician -> investigating.",
      "details": {
        "from": "waiting_for_technician",
        "to": "investigating"
      }
    },
    {
      "sequence": 26,
      "event_type": "decision_recorded",
      "summary": "Les mesures doivent primer sur une apparence visuelle incertaine.",
      "details": {
        "action_id": "action-4",
        "tool_name": "compare_measurements",
        "distinguishes": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 27,
      "event_type": "observation_added",
      "summary": "Observation ajoutée depuis observation.",
      "details": {
        "observation_id": "observation:comparison-4",
        "source_type": "observation",
        "source_id": "action-4"
      }
    },
    {
      "sequence": 28,
      "event_type": "evidence_added",
      "summary": "Preuve créée par référence à une observation validée.",
      "details": {
        "evidence_id": "comparison-4",
        "observation_id": "observation:comparison-4",
        "source_type": "observation",
        "source_id": "action-4"
      }
    },
    {
      "sequence": 29,
      "event_type": "verification_recorded",
      "summary": "Résultat d'outil validé et enregistré.",
      "details": {
        "verification_id": "verification:action-4",
        "action_id": "action-4",
        "evidence_ids": [
          "comparison-4"
        ]
      }
    },
    {
      "sequence": 30,
      "event_type": "verification_recorded",
      "summary": "Impacts de vérification validés par le cœur.",
      "details": {
        "verification_id": "verification:action-4",
        "hypothesis_ids": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 31,
      "event_type": "hypothesis_changed",
      "summary": "H1: plausible -> weakened.",
      "details": {
        "hypothesis_id": "H1",
        "from": "plausible",
        "to": "weakened",
        "verification_id": "verification:action-4",
        "evidence_ids": [
          "comparison-4"
        ]
      }
    },
    {
      "sequence": 32,
      "event_type": "hypothesis_changed",
      "summary": "H2: unexplored -> supported.",
      "details": {
        "hypothesis_id": "H2",
        "from": "unexplored",
        "to": "supported",
        "verification_id": "verification:action-4",
        "evidence_ids": [
          "comparison-4"
        ]
      }
    },
    {
      "sequence": 33,
      "event_type": "decision_recorded",
      "summary": "La chute électrique mesurée contredit l'explication limitée à la poussière.",
      "details": {
        "action_id": "action-5",
        "tool_name": "finish_investigation",
        "distinguishes": [
          "H1",
          "H2"
        ]
      }
    },
    {
      "sequence": 34,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> completed.",
      "details": {
        "from": "investigating",
        "to": "completed"
      }
    }
  ],
  "conclusion": {
    "diagnosis": "Anomalie de chaîne électrique malgré la poussière visible.",
    "confidence": 0.86,
    "evidence_ids": [
      "image-dust",
      "m-array",
      "m-inverter",
      "comparison-4"
    ],
    "remaining_uncertainties": [
      "Le composant précis de la liaison reste à localiser en sécurité."
    ]
  }
}
```

### Timeline complète

```json
[
  {
    "sequence": 1,
    "event_type": "decision_recorded",
    "summary": "Documenter l'état visuel du champ sans en déduire seul la cause.",
    "details": {
      "action_id": "action-1",
      "tool_name": "analyze_image",
      "distinguishes": [
        "H0",
        "H1"
      ]
    }
  },
  {
    "sequence": 2,
    "event_type": "action_requested",
    "summary": "Action externe demandée : analyze_image.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 3,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 4,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis image_analysis.",
    "details": {
      "observation_id": "observation:image-dust",
      "source_type": "image_analysis",
      "source_id": "panel-photo"
    }
  },
  {
    "sequence": 5,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "image-dust",
      "observation_id": "observation:image-dust",
      "source_type": "image_analysis",
      "source_id": "panel-photo"
    }
  },
  {
    "sequence": 6,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-1",
      "action_id": "action-1",
      "evidence_ids": [
        "image-dust"
      ]
    }
  },
  {
    "sequence": 7,
    "event_type": "hypothesis_changed",
    "summary": "H1: unexplored -> plausible.",
    "details": {
      "hypothesis_id": "H1",
      "from": "unexplored",
      "to": "plausible",
      "verification_id": "verification:action-1",
      "evidence_ids": [
        "image-dust"
      ]
    }
  },
  {
    "sequence": 8,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 9,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  },
  {
    "sequence": 10,
    "event_type": "decision_recorded",
    "summary": "Vérifier par une mesure l'hypothèse suggérée par l'image.",
    "details": {
      "action_id": "action-2",
      "tool_name": "request_measurement",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 11,
    "event_type": "action_requested",
    "summary": "Action externe demandée : request_measurement.",
    "details": {
      "action_id": "action-2"
    }
  },
  {
    "sequence": 12,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 13,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis measurement.",
    "details": {
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array"
    }
  },
  {
    "sequence": 14,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "m-array",
      "observation_id": "observation:m-array",
      "source_type": "measurement",
      "source_id": "m-array"
    }
  },
  {
    "sequence": 15,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-2",
      "action_id": "action-2",
      "evidence_ids": [
        "m-array"
      ]
    }
  },
  {
    "sequence": 16,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-2"
    }
  },
  {
    "sequence": 17,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  },
  {
    "sequence": 18,
    "event_type": "decision_recorded",
    "summary": "Comparer la tension avant et après la liaison électrique.",
    "details": {
      "action_id": "action-3",
      "tool_name": "request_measurement",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 19,
    "event_type": "action_requested",
    "summary": "Action externe demandée : request_measurement.",
    "details": {
      "action_id": "action-3"
    }
  },
  {
    "sequence": 20,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 21,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis measurement.",
    "details": {
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter"
    }
  },
  {
    "sequence": 22,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "m-inverter",
      "observation_id": "observation:m-inverter",
      "source_type": "measurement",
      "source_id": "m-inverter"
    }
  },
  {
    "sequence": 23,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-3",
      "action_id": "action-3",
      "evidence_ids": [
        "m-inverter"
      ]
    }
  },
  {
    "sequence": 24,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-3"
    }
  },
  {
    "sequence": 25,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  },
  {
    "sequence": 26,
    "event_type": "decision_recorded",
    "summary": "Les mesures doivent primer sur une apparence visuelle incertaine.",
    "details": {
      "action_id": "action-4",
      "tool_name": "compare_measurements",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 27,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis observation.",
    "details": {
      "observation_id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4"
    }
  },
  {
    "sequence": 28,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "comparison-4",
      "observation_id": "observation:comparison-4",
      "source_type": "observation",
      "source_id": "action-4"
    }
  },
  {
    "sequence": 29,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-4",
      "action_id": "action-4",
      "evidence_ids": [
        "comparison-4"
      ]
    }
  },
  {
    "sequence": 30,
    "event_type": "verification_recorded",
    "summary": "Impacts de vérification validés par le cœur.",
    "details": {
      "verification_id": "verification:action-4",
      "hypothesis_ids": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 31,
    "event_type": "hypothesis_changed",
    "summary": "H1: plausible -> weakened.",
    "details": {
      "hypothesis_id": "H1",
      "from": "plausible",
      "to": "weakened",
      "verification_id": "verification:action-4",
      "evidence_ids": [
        "comparison-4"
      ]
    }
  },
  {
    "sequence": 32,
    "event_type": "hypothesis_changed",
    "summary": "H2: unexplored -> supported.",
    "details": {
      "hypothesis_id": "H2",
      "from": "unexplored",
      "to": "supported",
      "verification_id": "verification:action-4",
      "evidence_ids": [
        "comparison-4"
      ]
    }
  },
  {
    "sequence": 33,
    "event_type": "decision_recorded",
    "summary": "La chute électrique mesurée contredit l'explication limitée à la poussière.",
    "details": {
      "action_id": "action-5",
      "tool_name": "finish_investigation",
      "distinguishes": [
        "H1",
        "H2"
      ]
    }
  },
  {
    "sequence": 34,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> completed.",
    "details": {
      "from": "investigating",
      "to": "completed"
    }
  }
]
```

## 4. Informations insuffisantes

Fixture de décisions : `insufficient_information.json`.

### État initial

```json
{
  "investigation_id": "validation-insufficient_information.json",
  "status": "investigating",
  "step_count": 0,
  "max_steps": 20,
  "problem": null,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  },
  "observations": {},
  "evidence": {},
  "verifications": {},
  "measurements": {},
  "pending_action": null,
  "timeline": [],
  "conclusion": null
}
```

### Étape 1

Décision réelle du provider scripté :

```json
{
  "tool_name": "ask_technician",
  "arguments": {
    "distinguishes": [
      "H0",
      "H1",
      "H2",
      "H3"
    ],
    "question": "Pouvez-vous relever l'état affiché par l'onduleur ?"
  },
  "reason": "Obtenir une observation minimale avant toute conclusion."
}
```

- Action proposée : `ask_technician`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `finish_investigation`

Résultat scripté fourni au moteur :

```json
{
  "kind": "technician_answer",
  "evidence_id": "answer-unavailable",
  "answer": "Impossible de relever l'affichage.",
  "impacts": []
}
```

Observations réellement créées :

```json
[
  {
    "id": "observation:answer-unavailable",
    "source_type": "technician_answer",
    "source_id": "action-1",
    "statement": "Impossible de relever l'affichage.",
    "value": null,
    "unit": null,
    "certainty": null
  }
]
```

Evidence réellement créées :

```json
[
  {
    "id": "answer-unavailable",
    "observation_id": "observation:answer-unavailable",
    "source_type": "technician_answer",
    "source_id": "action-1",
    "certainty": null
  }
]
```

Changements de statut d'hypothèse :

```json
[]
```

Preuves justifiant ces changements :

```json
[]
```

État après l'étape :

```json
{
  "status": "investigating",
  "step_count": 1,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 1,
    "event_type": "decision_recorded",
    "summary": "Obtenir une observation minimale avant toute conclusion.",
    "details": {
      "action_id": "action-1",
      "tool_name": "ask_technician",
      "distinguishes": [
        "H0",
        "H1",
        "H2",
        "H3"
      ]
    }
  },
  {
    "sequence": 2,
    "event_type": "action_requested",
    "summary": "Action externe demandée : ask_technician.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 3,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 4,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis technician_answer.",
    "details": {
      "observation_id": "observation:answer-unavailable",
      "source_type": "technician_answer",
      "source_id": "action-1"
    }
  },
  {
    "sequence": 5,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "answer-unavailable",
      "observation_id": "observation:answer-unavailable",
      "source_type": "technician_answer",
      "source_id": "action-1"
    }
  },
  {
    "sequence": 6,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-1",
      "action_id": "action-1",
      "evidence_ids": [
        "answer-unavailable"
      ]
    }
  },
  {
    "sequence": 7,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 8,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  }
]
```

### Étape 2

Décision réelle du provider scripté :

```json
{
  "tool_name": "finish_investigation",
  "arguments": {
    "distinguishes": [
      "H0",
      "H1",
      "H2",
      "H3"
    ],
    "outcome": "insufficient_information",
    "diagnosis": null,
    "confidence": 0.0,
    "evidence": [
      "answer-unavailable"
    ],
    "remaining_uncertainties": [
      "État de l'onduleur inconnu.",
      "Aucune mesure électrique disponible.",
      "État du stockage inconnu."
    ]
  },
  "reason": "La seule réponse reçue ne permet pas de départager les hypothèses."
}
```

- Action proposée : `finish_investigation`
- Validation par le Core : `accepted`
- État d'entrée du provider inchangé : `true`
- Prochaine action : `aucune`

Résultat scripté fourni au moteur :

```json
{
  "kind": "none",
  "note": "Aucun résultat externe : action exécutée par le Core ou fin."
}
```

Observations réellement créées :

```json
[]
```

Evidence réellement créées :

```json
[]
```

Changements de statut d'hypothèse :

```json
[]
```

Preuves justifiant ces changements :

```json
[]
```

État après l'étape :

```json
{
  "status": "insufficient_information",
  "step_count": 2,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  }
}
```

Événements de timeline de l'étape :

```json
[
  {
    "sequence": 9,
    "event_type": "decision_recorded",
    "summary": "La seule réponse reçue ne permet pas de départager les hypothèses.",
    "details": {
      "action_id": "action-2",
      "tool_name": "finish_investigation",
      "distinguishes": [
        "H0",
        "H1",
        "H2",
        "H3"
      ]
    }
  },
  {
    "sequence": 10,
    "event_type": "status_changed",
    "summary": "Les preuves disponibles ne permettent pas de conclure.",
    "details": {
      "from": "investigating",
      "to": "insufficient_information"
    }
  }
]
```

### État final

```json
{
  "investigation_id": "validation-insufficient_information.json",
  "status": "insufficient_information",
  "step_count": 2,
  "max_steps": 20,
  "problem": null,
  "installation": {
    "nominal_power_kwp": null,
    "panel_count": null,
    "inverter_model": null,
    "battery_present": null,
    "battery_capacity_kwh": null,
    "system_voltage_v": null
  },
  "hypotheses": {
    "H0": {
      "hypothesis_id": "H0",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H1": {
      "hypothesis_id": "H1",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H2": {
      "hypothesis_id": "H2",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    },
    "H3": {
      "hypothesis_id": "H3",
      "status": "unexplored",
      "supporting_evidence_ids": [],
      "contradictory_evidence_ids": []
    }
  },
  "observations": {
    "observation:answer-unavailable": {
      "id": "observation:answer-unavailable",
      "source_type": "technician_answer",
      "source_id": "action-1",
      "statement": "Impossible de relever l'affichage.",
      "value": null,
      "unit": null,
      "certainty": null
    }
  },
  "evidence": {
    "answer-unavailable": {
      "id": "answer-unavailable",
      "observation_id": "observation:answer-unavailable",
      "source_type": "technician_answer",
      "source_id": "action-1",
      "certainty": null
    }
  },
  "verifications": {
    "verification:action-1": {
      "id": "verification:action-1",
      "action_id": "action-1",
      "distinguishes": [
        "H0",
        "H1",
        "H2",
        "H3"
      ],
      "observation_ids": [
        "observation:answer-unavailable"
      ],
      "evidence_ids": [
        "answer-unavailable"
      ],
      "impacts": []
    }
  },
  "measurements": {},
  "pending_action": null,
  "timeline": [
    {
      "sequence": 1,
      "event_type": "decision_recorded",
      "summary": "Obtenir une observation minimale avant toute conclusion.",
      "details": {
        "action_id": "action-1",
        "tool_name": "ask_technician",
        "distinguishes": [
          "H0",
          "H1",
          "H2",
          "H3"
        ]
      }
    },
    {
      "sequence": 2,
      "event_type": "action_requested",
      "summary": "Action externe demandée : ask_technician.",
      "details": {
        "action_id": "action-1"
      }
    },
    {
      "sequence": 3,
      "event_type": "status_changed",
      "summary": "Statut : investigating -> waiting_for_technician.",
      "details": {
        "from": "investigating",
        "to": "waiting_for_technician"
      }
    },
    {
      "sequence": 4,
      "event_type": "observation_added",
      "summary": "Observation ajoutée depuis technician_answer.",
      "details": {
        "observation_id": "observation:answer-unavailable",
        "source_type": "technician_answer",
        "source_id": "action-1"
      }
    },
    {
      "sequence": 5,
      "event_type": "evidence_added",
      "summary": "Preuve créée par référence à une observation validée.",
      "details": {
        "evidence_id": "answer-unavailable",
        "observation_id": "observation:answer-unavailable",
        "source_type": "technician_answer",
        "source_id": "action-1"
      }
    },
    {
      "sequence": 6,
      "event_type": "verification_recorded",
      "summary": "Résultat d'outil validé et enregistré.",
      "details": {
        "verification_id": "verification:action-1",
        "action_id": "action-1",
        "evidence_ids": [
          "answer-unavailable"
        ]
      }
    },
    {
      "sequence": 7,
      "event_type": "action_resumed",
      "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
      "details": {
        "action_id": "action-1"
      }
    },
    {
      "sequence": 8,
      "event_type": "status_changed",
      "summary": "Statut : waiting_for_technician -> investigating.",
      "details": {
        "from": "waiting_for_technician",
        "to": "investigating"
      }
    },
    {
      "sequence": 9,
      "event_type": "decision_recorded",
      "summary": "La seule réponse reçue ne permet pas de départager les hypothèses.",
      "details": {
        "action_id": "action-2",
        "tool_name": "finish_investigation",
        "distinguishes": [
          "H0",
          "H1",
          "H2",
          "H3"
        ]
      }
    },
    {
      "sequence": 10,
      "event_type": "status_changed",
      "summary": "Les preuves disponibles ne permettent pas de conclure.",
      "details": {
        "from": "investigating",
        "to": "insufficient_information"
      }
    }
  ],
  "conclusion": null
}
```

### Timeline complète

```json
[
  {
    "sequence": 1,
    "event_type": "decision_recorded",
    "summary": "Obtenir une observation minimale avant toute conclusion.",
    "details": {
      "action_id": "action-1",
      "tool_name": "ask_technician",
      "distinguishes": [
        "H0",
        "H1",
        "H2",
        "H3"
      ]
    }
  },
  {
    "sequence": 2,
    "event_type": "action_requested",
    "summary": "Action externe demandée : ask_technician.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 3,
    "event_type": "status_changed",
    "summary": "Statut : investigating -> waiting_for_technician.",
    "details": {
      "from": "investigating",
      "to": "waiting_for_technician"
    }
  },
  {
    "sequence": 4,
    "event_type": "observation_added",
    "summary": "Observation ajoutée depuis technician_answer.",
    "details": {
      "observation_id": "observation:answer-unavailable",
      "source_type": "technician_answer",
      "source_id": "action-1"
    }
  },
  {
    "sequence": 5,
    "event_type": "evidence_added",
    "summary": "Preuve créée par référence à une observation validée.",
    "details": {
      "evidence_id": "answer-unavailable",
      "observation_id": "observation:answer-unavailable",
      "source_type": "technician_answer",
      "source_id": "action-1"
    }
  },
  {
    "sequence": 6,
    "event_type": "verification_recorded",
    "summary": "Résultat d'outil validé et enregistré.",
    "details": {
      "verification_id": "verification:action-1",
      "action_id": "action-1",
      "evidence_ids": [
        "answer-unavailable"
      ]
    }
  },
  {
    "sequence": 7,
    "event_type": "action_resumed",
    "summary": "Résultat externe reçu ; l'investigation peut reprendre.",
    "details": {
      "action_id": "action-1"
    }
  },
  {
    "sequence": 8,
    "event_type": "status_changed",
    "summary": "Statut : waiting_for_technician -> investigating.",
    "details": {
      "from": "waiting_for_technician",
      "to": "investigating"
    }
  },
  {
    "sequence": 9,
    "event_type": "decision_recorded",
    "summary": "La seule réponse reçue ne permet pas de départager les hypothèses.",
    "details": {
      "action_id": "action-2",
      "tool_name": "finish_investigation",
      "distinguishes": [
        "H0",
        "H1",
        "H2",
        "H3"
      ]
    }
  },
  {
    "sequence": 10,
    "event_type": "status_changed",
    "summary": "Les preuves disponibles ne permettent pas de conclure.",
    "details": {
      "from": "investigating",
      "to": "insufficient_information"
    }
  }
]
```

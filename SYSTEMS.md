# Goatsi Bot — System Map

## ⚠️ READ THIS BEFORE TOUCHING ANY FILE ⚠️

There are TWO completely separate tournament systems in this bot.
They share only the utility files in src/utils/.
DO NOT mix them up.

---

## 🏆 BOTOLA TOURNAMENT SYSTEM → src/botola/
Regular tournament management (group stage + knockout).
Custom IDs: p1_*, p2_*, p3_*, enr_*

All code lives in: src/botola/
Entry commands:    src/commands/manage.js, src/commands/panels.js
See full file list: src/botola/SYSTEM.md

---

## 🌍 FEDERATION SYSTEM (MEF) → src/federation/
Inter-club federation competition system (leagues, cups).
Custom IDs: fed_*, clan_*, roster_*

All code lives in: src/federation/
Entry commands:    src/commands/federation.js, src/commands/clans_fed_database.js
See full file list: src/federation/SYSTEM.md

---

## Shared utilities → src/utils/
database.js, permissions.js, templateConfig.js, tempState.js,
fuzzyTeam.js, embeds.js, channelRouter.js, embeds.js,
winnersHistory.js, tournamentManagerPanel.js

## Routing → src/events/interactionCreate.js
Routes custom_ids to the correct system handler.

---

**Rule: if you are asked to fix the Botola system, touch ONLY src/botola/
       If you are asked to fix the Federation system, touch ONLY src/federation/**

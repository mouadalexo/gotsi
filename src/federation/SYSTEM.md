# FEDERATION SYSTEM (MEF)

This directory contains ALL files for the Federation / MEF competition system.

## Files
- federationInteractions.js — main handler for all federation button/select interactions
- fedRosterInteractions.js  — roster management interactions
- fedPanel1.js              — federation panel 1 (overview/management)
- fedPanel2.js              — federation panel 2 (schedule/matches)
- fedPanel3.js              — federation panel 3 (bracket/standings)
- fedRosterPanel.js         — roster UI builder
- federationPanel.js        — federation config panel
- fedEmbeds.js              — embed builders for federation posts
- fedRosterPdf.js           — PDF roster generator
- fedRosterPng.js           — PNG roster generator

## Entry points (outside this dir)
- src/commands/federation.js         — slash command entry point
- src/commands/clans_fed_database.js — clan database command
- src/events/interactionCreate.js    — routes fed_* custom_ids here
- src/events/messageCreate.js        — federation message events

## DO NOT confuse with Botola — see src/botola/SYSTEM.md

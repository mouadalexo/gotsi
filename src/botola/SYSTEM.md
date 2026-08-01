# BOTOLA TOURNAMENT SYSTEM

This directory contains ALL files for the Botola (regular tournament) system.

## Files
- botolaInteractions.js — main handler for all p1_/p2_/p3_ button interactions
- enrollInteractions.js — team enrollment/registration interactions
- resultInteractions.js — legacy result entry interactions
- panel1.js             — management panel 1 (overview, advance, results)
- panel2.js             — management panel 2 (team roster)
- panel3.js             — management panel 3 (schedule/bracket posting)
- enrollPanel.js        — enrollment UI builder
- resultsPanel.js       — results embed builder
- standingsPanel.js     — standings & bracket embed builder
- tournamentEmbeds.js   — shared embed/post builders for schedule & results

## Entry points (outside this dir)
- src/commands/manage.js             — /manage slash command
- src/commands/panels.js             — /panels slash command
- src/events/interactionCreate.js    — routes p1_/p2_/p3_/enr_ custom_ids here
- src/events/ready.js                — bot startup refresh

## DO NOT confuse with Federation — see src/federation/SYSTEM.md

#!/usr/bin/env python3
"""Patch botolaInteractions.js to add Winners History support."""
import re

PATH = '/home/ubuntu/goatsi/src/interactions/botolaInteractions.js'

with open(PATH, 'r') as f:
    src = f.read()

# ── 1. Add winnersHistory require after the existing requires ─────────────────
OLD_REQUIRE = "const { makeScheduleEmbed }    = require('../utils/tournamentEmbeds');"
NEW_REQUIRE = (
    "const { makeScheduleEmbed }    = require('../utils/tournamentEmbeds');\n"
    "const { buildWinnersHistoryPayload } = require('../utils/winnersHistory');"
)

if 'buildWinnersHistoryPayload' not in src:
    src = src.replace(OLD_REQUIRE, NEW_REQUIRE, 1)
    print('✓ Added winnersHistory require')
else:
    print('! winnersHistory require already present, skipping')

# ── 2. Add confirm_winner and winner_confirm handlers before newedition ────────
# Find the newedition block and insert BEFORE it
NEW_HANDLERS = r"""
    // ── Confirm Winner ──────────────────────────────────────────────────────
    if (action === 'confirm_winner') {
      // Find the final match (lowest round number in knockout, status played)
      const playedKO = allMatches.filter(m => m.stage === 'knockout' && m.status === 'played');
      const finalRound = playedKO.length ? Math.min(...playedKO.map(m => m.round)) : null;
      const finalMatch = finalRound !== null ? playedKO.find(m => m.round === finalRound) : null;
      if (!finalMatch) return interaction.reply({ content: '❌ No final match found.', ephemeral: true });

      const winTeamId = finalMatch.home_score > finalMatch.away_score
        ? finalMatch.home_team_id : finalMatch.away_team_id;
      const winTeam = db.findById('teams', winTeamId);

      // Find players for this team in this tournament
      const winTTs   = db.findWhere('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === winTeamId);
      const players  = db.findWhere('players', p => winTTs.some(tt => tt.id === p.tournament_team_id));
      const playerList = players.length
        ? players.map(p => `<@${p.discord_id}>`).join(', ')
        : '`No players registered`';

      const hasRole  = !!t.winner_role_id;
      const hasRef   = !!t.winners_history_ref;

      const confirmPayload = {
        flags: 32768,
        components: [{ type: 17, accent_color: 0xFFD700, components: [
          { type: 10, content:
            `# 🏆  Confirm Season Winner\n` +
            `> **Tournament:** ${t.name}  —  Season ${t.season}\n` +
            `> **Champion:** ${winTeam?.name || 'Unknown'}\n` +
            `> **Players:** ${playerList}`
          },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content:
            `**Actions that will be performed:**\n` +
            (hasRole
              ? `✅ Remove winner role from previous champion(s)\n✅ Assign winner role to new champion's players\n`
              : `⚠️ No winner role configured for this tournament (set one via /manage → 🏆 Winners Setup)\n`) +
            (hasRef
              ? `✅ Update the Winners History leaderboard message`
              : `⚠️ No winners history message configured (set one via /manage → 🏆 Winners Setup)`)
          },
          { type: 14, divider: true, spacing: 1 },
          { type: 1, components: [
            { type: 2, style: 1, label: '✅ Confirm Winner', custom_id: `p1_${tid}_winner_confirm` },
            { type: 2, style: 2, label: 'Cancel',            custom_id: `p1_${tid}_refresh` },
          ]},
        ]}],
      };
      return interaction.reply({ ...confirmPayload, ephemeral: true });
    }

    // ── Execute Winner Confirmation ─────────────────────────────────────────
    if (action === 'winner_confirm') {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;

      // Already confirmed?
      const alreadyConfirmed = db.findOne('winners', w => w.tournament_id === tid && w.season === t.season);
      if (alreadyConfirmed) {
        return interaction.editReply({ content: '⚠️ Winner already confirmed for this season.' });
      }

      // Find final match
      const playedKO2  = allMatches.filter(m => m.stage === 'knockout' && m.status === 'played');
      const finalRound2 = playedKO2.length ? Math.min(...playedKO2.map(m => m.round)) : null;
      const finalMatch2 = finalRound2 !== null ? playedKO2.find(m => m.round === finalRound2) : null;
      if (!finalMatch2) return interaction.editReply({ content: '❌ No final match found.' });

      const winTeamId2 = finalMatch2.home_score > finalMatch2.away_score
        ? finalMatch2.home_team_id : finalMatch2.away_team_id;
      const winTeam2   = db.findById('teams', winTeamId2);

      // Find players
      const winTTs2   = db.findWhere('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === winTeamId2);
      const players2  = db.findWhere('players', p => winTTs2.some(tt => tt.id === p.tournament_team_id));
      const playerIds = players2.map(p => p.discord_id).filter(Boolean);

      const roleId = t.winner_role_id;
      let roleMsg  = '';

      if (roleId) {
        // Remove role from all previous winners of this tournament
        const prevWinners = db.findWhere('winners', w => w.tournament_id === tid);
        for (const pw of prevWinners) {
          for (const pid of (pw.player_ids || [])) {
            try {
              const mem = await guild.members.fetch(pid).catch(() => null);
              if (mem) await mem.roles.remove(roleId).catch(() => {});
            } catch {}
          }
        }
        // Give role to new winners
        const given = [];
        for (const pid of playerIds) {
          try {
            const mem = await guild.members.fetch(pid).catch(() => null);
            if (mem) { await mem.roles.add(roleId).catch(() => {}); given.push(`<@${pid}>`); }
          } catch {}
        }
        roleMsg = given.length
          ? `✅ Winner role assigned to: ${given.join(', ')}`
          : '⚠️ Could not find members to assign winner role.';
      } else {
        roleMsg = '⚠️ No winner role configured for this tournament.';
      }

      // Insert winner record
      db.insert('winners', {
        tournament_id: tid,
        season:        t.season,
        team_id:       winTeamId2,
        player_ids:    playerIds,
        confirmed_by:  interaction.user.id,
      });

      // Edit winners history leaderboard message
      const ref = t.winners_history_ref;
      let refMsg = '';
      if (ref) {
        try {
          const wCh  = await cli.channels.fetch(ref.channelId).catch(() => null);
          const wMsg = await wCh?.messages.fetch(ref.messageId).catch(() => null);
          if (wMsg) {
            await wMsg.edit(buildWinnersHistoryPayload(tid)).catch(() => {});
            refMsg = `✅ Winners History leaderboard updated in <#${ref.channelId}>`;
          } else {
            refMsg = '⚠️ Could not find winners history message to update.';
          }
        } catch (e) {
          refMsg = `⚠️ Failed to update leaderboard: ${e.message}`;
        }
      } else {
        refMsg = '⚠️ No winners history message configured.';
      }

      // Refresh Panel 1
      const freshT = db.findById('tournaments', tid);
      await refreshPanel(cli, freshT, 1);

      return interaction.editReply({
        content:
          `# 🏆  Season ${t.season} Winner Confirmed!\n` +
          `**${winTeam2?.name || 'Unknown'}** is the official champion.\n\n` +
          `${roleMsg}\n${refMsg}`,
      });
    }

"""

# Insert the new handlers BEFORE the newedition handler
NEWEDITION_MARKER = '    // New Edition (when finished)\n    if (action === \'newedition\')'
if NEWEDITION_MARKER in src and 'confirm_winner' not in src:
    src = src.replace(NEWEDITION_MARKER, NEW_HANDLERS + NEWEDITION_MARKER, 1)
    print('✓ Added confirm_winner and winner_confirm handlers')
elif 'confirm_winner' in src:
    print('! Winner handlers already present, skipping')
else:
    print('ERROR: Could not find newedition marker!')

with open(PATH, 'w') as f:
    f.write(src)

print('Done patching botolaInteractions.js')

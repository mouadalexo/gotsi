'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db }         = require('../utils/database');
const { isManager, isAdmin } = require('../utils/permissions');
const { buildManagePanelV2, buildAdminsSubPanel } = require('../panels/managePanel');

function noPermission(i) {
  return i.reply({ content: '❌ Admins only.', ephemeral: true });
}

async function handleMgr2Interaction(interaction) {
  const id = interaction.customId;

  if (!isManager(interaction.member)) return noPermission(interaction);

  // ── Refresh manage panel ─────────────────────────────────────────────────
  if (id === 'mgr2_refresh') {
    return interaction.update(buildManagePanelV2());
  }

  // ── Bot Settings ─────────────────────────────────────────────────────────
  if (id === 'mgr2_bots') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const cfg = db.getConfig('bot_config') || {};
    return interaction.showModal(
      new ModalBuilder().setCustomId('mgr2_bot_modal').setTitle('Bot Settings')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Bot Display Name')
              .setStyle(TextInputStyle.Short).setValue(cfg.name || 'Night Stars Bot').setRequired(false)
          ),
        )
    );
  }

  if (id === 'mgr2_bot_modal') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const name = interaction.fields.getTextInputValue('name').trim();
    const cur  = db.getConfig('bot_config') || {};
    db.setConfig('bot_config', { ...cur, name: name || cur.name });
    await interaction.update(buildManagePanelV2());
    return interaction.followUp({ content: '✅ Bot settings saved.', ephemeral: true });
  }

  // ── Manage Admins ────────────────────────────────────────────────────────
  if (id === 'mgr2_admins') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    return interaction.update(buildAdminsSubPanel());
  }

  if (id === 'mgr2_admin_add_admin' || id === 'mgr2_admin_add_manager') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const role = id === 'mgr2_admin_add_admin' ? 'admin' : 'manager';
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_admin_add_modal_${role}`).setTitle(`Add ${role.charAt(0).toUpperCase() + role.slice(1)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discord_id').setLabel('Discord User ID')
              .setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('username').setLabel('Username (for display)')
              .setStyle(TextInputStyle.Short).setRequired(false)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_admin_add_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const role      = id.replace('mgr2_admin_add_modal_', '');
    const discordId = interaction.fields.getTextInputValue('discord_id').trim().replace(/\D/g, '');
    const username  = interaction.fields.getTextInputValue('username').trim();
    if (!discordId) return interaction.reply({ content: '❌ Invalid Discord ID.', ephemeral: true });
    const existing = db.findOne('admins', a => a.discord_id === discordId);
    if (existing) {
      db.update('admins', existing.id, { role, username: username || existing.username });
    } else {
      db.insert('admins', { discord_id: discordId, username, role });
    }
    await interaction.update(buildAdminsSubPanel());
    return interaction.followUp({ content: `✅ <@${discordId}> added as **${role}**.`, ephemeral: true });
  }

  if (id === 'mgr2_admin_del_start') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const admins = db.get('admins') || [];
    if (!admins.length) return interaction.reply({ content: '❌ No admins to remove.', ephemeral: true });
    const SEP = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xED4245, components: [
        { type: 10, content: '**Remove Admin/Manager — Select user**' },
        SEP,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_admin_del_sel', placeholder: 'Select user to remove...',
          options: admins.slice(0, 25).map(a => ({
            label: a.username || `User ${a.discord_id}`,
            value: String(a.id),
            description: a.role,
          })),
        }]},
        SEP,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_admins' }]},
      ]}],
    });
  }

  if (id === 'mgr2_admin_del_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const adminId = parseInt(interaction.values[0]);
    const admin   = db.findById('admins', adminId);
    if (!admin) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
    db.delete('admins', adminId);
    await interaction.update(buildAdminsSubPanel());
    return interaction.followUp({ content: `✅ Removed <@${admin.discord_id}> (${admin.role}).`, ephemeral: true });
  }

  // ── New Tournament ───────────────────────────────────────────────────────
  if (id === 'mgr2_newtournament') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    return interaction.showModal(
      new ModalBuilder().setCustomId('mgr2_tournament_s1').setTitle('New Tournament — Step 1')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Tournament Name')
              .setStyle(TextInputStyle.Short).setPlaceholder('Night Stars League S1').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('template').setLabel('Template/Short Tag (e.g. NSEL, MCL, NSF)')
              .setStyle(TextInputStyle.Short).setPlaceholder('NSEL').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_count').setLabel('Number of Teams (e.g. 8, 16, 32)')
              .setStyle(TextInputStyle.Short).setPlaceholder('16').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('teams_per_group').setLabel('Teams per Group')
              .setStyle(TextInputStyle.Short).setPlaceholder('4').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('advance_per_group').setLabel('Teams Advancing per Group')
              .setStyle(TextInputStyle.Short).setPlaceholder('2').setRequired(true)
          ),
        )
    );
  }

  if (id === 'mgr2_tournament_s1') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const name      = interaction.fields.getTextInputValue('name').trim();
    const template  = interaction.fields.getTextInputValue('template').trim().toUpperCase();
    const teamCount = parseInt(interaction.fields.getTextInputValue('team_count')) || 16;
    const tpg       = parseInt(interaction.fields.getTextInputValue('teams_per_group')) || 4;
    const apg       = parseInt(interaction.fields.getTextInputValue('advance_per_group')) || 2;
    // Store step 1 data in config temporarily keyed by user
    db.setConfig(`mgr2_pending_${interaction.user.id}`, { name, template, team_count: teamCount, teams_per_group: tpg, advance_per_group: apg });

    return interaction.showModal(
      new ModalBuilder().setCustomId('mgr2_tournament_s2').setTitle('New Tournament — Step 2')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('players_per_team').setLabel('Players per Team (1=solo, 2=duo, 5=squad)')
              .setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('encounters').setLabel('Encounters per Match (1=single, 2=home+away)')
              .setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('pts').setLabel('Points: Win / Draw / Loss (e.g. 3,1,0)')
              .setStyle(TextInputStyle.Short).setPlaceholder('3,1,0').setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('deadline').setLabel('Round Deadline Hours (optional)')
              .setStyle(TextInputStyle.Short).setPlaceholder('48').setRequired(false)
          ),
        )
    );
  }

  if (id === 'mgr2_tournament_s2') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const pending = db.getConfig(`mgr2_pending_${interaction.user.id}`);
    if (!pending) return interaction.reply({ content: '❌ Session expired. Start again.', ephemeral: true });

    const ppt      = parseInt(interaction.fields.getTextInputValue('players_per_team')) || 1;
    const enc      = parseInt(interaction.fields.getTextInputValue('encounters')) || 1;
    const ptsRaw   = interaction.fields.getTextInputValue('pts').trim() || '3,1,0';
    const deadline = parseInt(interaction.fields.getTextInputValue('deadline')) || null;
    const [wp, dp, lp] = ptsRaw.split(',').map(x => parseInt(x.trim())).map(n => isNaN(n) ? 0 : n);

    const season = db.get('tournaments').filter(t => t.template === pending.template).length + 1;
    const t = db.insert('tournaments', {
      name: pending.name, template: pending.template, season,
      team_count: pending.team_count, teams_per_group: pending.teams_per_group,
      advance_per_group: pending.advance_per_group,
      players_per_team: ppt, encounters: enc,
      win_pts: wp ?? 3, draw_pts: dp ?? 1, loss_pts: lp ?? 0, forfeit_pts: 0,
      round_deadline_hours: deadline,
      status: 'setup', registration_open: true,
      type: 'group_knockout', channels: {},
    });

    // Clean up pending
    db.setConfig(`mgr2_pending_${interaction.user.id}`, null);

    await interaction.update(buildManagePanelV2());
    return interaction.followUp({
      content: `✅ **${t.name}** (Season ${t.season}) created!\nUse \`/botola\` to open its panels.`,
      ephemeral: true,
    });
  }

  // ── Set Channels (per tournament) ────────────────────────────────────────
  if (id === 'mgr2_channels_start') {
    const tournaments = db.get('tournaments').filter(t => t.status !== 'finished');
    if (!tournaments.length) return interaction.reply({ content: '❌ No active tournaments.', ephemeral: true });
    const SEP = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0x5865F2, components: [
        { type: 10, content: '**📺 Set Channels — Select a tournament**' },
        SEP,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_channels_sel', placeholder: 'Select tournament...',
          options: tournaments.slice(0, 25).map(t => ({
            label: t.name.slice(0, 100), value: String(t.id),
            description: `S${t.season} · ${t.status}`,
          })),
        }]},
        SEP,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_refresh' }]},
      ]}],
    });
  }

  if (id === 'mgr2_channels_sel') {
    const tid = parseInt(interaction.values[0]);
    const t   = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    const ch  = t.channels || {};
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_channels_modal_${tid}`).setTitle(`Channels: ${t.name.slice(0, 30)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('management').setLabel('Management Channel ID')
              .setStyle(TextInputStyle.Short).setValue(ch.management || '').setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('registration').setLabel('Registration Channel ID')
              .setStyle(TextInputStyle.Short).setValue(ch.registration || '').setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('results').setLabel('Results Channel ID')
              .setStyle(TextInputStyle.Short).setValue(ch.results || '').setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('schedule').setLabel('Schedule Channel ID')
              .setStyle(TextInputStyle.Short).setValue(ch.schedule || '').setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('standings').setLabel('Standings Channel ID')
              .setStyle(TextInputStyle.Short).setValue(ch.standings || '').setRequired(false)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_channels_modal_')) {
    const tid = parseInt(id.replace('mgr2_channels_modal_', ''));
    const mgmt= interaction.fields.getTextInputValue('management').trim();
    const reg = interaction.fields.getTextInputValue('registration').trim();
    const res = interaction.fields.getTextInputValue('results').trim();
    const sch = interaction.fields.getTextInputValue('schedule').trim();
    const std = interaction.fields.getTextInputValue('standings').trim();
    db.update('tournaments', tid, { channels: {
      management: mgmt || null, registration: reg || null,
      results: res || null, schedule: sch || null, standings: std || null,
    }});
    await interaction.update(buildManagePanelV2());
    return interaction.followUp({ content: '✅ Channels saved.', ephemeral: true });
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  if (id === 'mgr2_reset') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const SEP = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xED4245, components: [
        { type: 10, content: '# ☢️  Reset Everything\n> **This will delete ALL tournaments, matches, teams and players. This cannot be undone.**' },
        SEP,
        { type: 1, components: [
          { type: 2, style: 4, label: 'Yes, Reset Everything', custom_id: 'mgr2_reset_confirm' },
          { type: 2, style: 2, label: 'Cancel',                custom_id: 'mgr2_refresh' },
        ]},
      ]}],
    });
  }

  if (id === 'mgr2_reset_confirm') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    // Wipe all game data but keep admins and bot_config
    db.get('tournaments').slice().forEach(t => db.delete('tournaments', t.id));
    db.get('tournament_teams').slice().forEach(tt => db.delete('tournament_teams', tt.id));
    db.get('matches').slice().forEach(m => db.delete('matches', m.id));
    await interaction.update(buildManagePanelV2());
    return interaction.followUp({ content: '✅ All tournament data has been reset.', ephemeral: true });
  }
}

module.exports = { handleMgr2Interaction };

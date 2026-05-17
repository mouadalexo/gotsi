'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');
const { db }         = require('../utils/database');
const { isManager, isAdmin } = require('../utils/permissions');
const { buildManagePanelV2, buildAdminsSubPanel, buildWinnersSubPanel } = require('../panels/managePanel');
const { buildWinnersHistoryPayload } = require('../utils/winnersHistory');

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

    const season = Math.max(0, ...db.get("tournaments").filter(x => x.template === pending.template).map(x => x.season)) + 1;
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

    // Auto-create winners history channel in the configured category
    const catId = db.getConfig('winners_history_category');
    if (catId) {
      try {
        const guild   = interaction.guild;
        const chName  = `${t.template.toLowerCase().replace(/[^a-z0-9]/g, '-')}-winners`;
        const winCh   = await guild.channels.create({
          name: chName,
          type: ChannelType.GuildText,
          parent: catId,
          topic: `Winners History — ${t.name}`,
        });
        const initMsg = await winCh.send(buildWinnersHistoryPayload(t.id)).catch(() => null);
        if (initMsg) {
          db.update('tournaments', t.id, {
            winners_history_ref: { channelId: winCh.id, messageId: initMsg.id },
          });
        }
      } catch (e) {
        console.error('[Winners] Failed to create history channel:', e.message);
      }
    }

    await interaction.update(buildManagePanelV2());
    return interaction.followUp({
      content: `✅ **${t.name}** (Season ${t.season}) created!${catId ? '\n🏆 Winners History channel auto-created.' : ''}\nUse \`/botola\` to open its panels.`,
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
    const tid  = parseInt(interaction.values[0]);
    const t    = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    const ch   = t.channels || {};
    const SEP2 = { type: 14, divider: true, spacing: 1 };
    const chSel = (label, key) => ({
      type: 1,
      components: [{
        type: 8, custom_id: `mgr2_ch_${tid}_${key}`,
        placeholder: ch[key] ? `${label} (currently set)` : `${label} — select channel`,
        channel_types: [0, 5], min_values: 0, max_values: 1,
        ...(ch[key] ? { default_values: [{ id: ch[key], type: 'channel' }] } : {}),
      }],
    });
    return interaction.reply({
      flags: 32768, ephemeral: true,
      components: [{ type: 17, accent_color: 0x5865F2, components: [
        { type: 10, content: `**📺 Set Channels — ${t.name}**\nSelect a channel for each category. Changes save instantly.` },
        SEP2,
        chSel('Management', 'management'),
        chSel('Results & Standings', 'results'),
        chSel('Schedule', 'schedule'),
        chSel('Teams List', 'teamsList'),
      ]}],
    });
  }

  if (id.startsWith('mgr2_ch_')) {
    const parts2 = id.replace('mgr2_ch_', '').split('_');
    const tid2   = parseInt(parts2[0]);
    const key2   = parts2.slice(1).join('_');
    const t2     = db.findById('tournaments', tid2);
    if (!t2) return interaction.reply({ content: '❌ Tournament not found.', flags: 64 });
    const val    = (interaction.values && interaction.values[0]) || null;
    const updCh  = { ...(t2.channels || {}), [key2]: val };
    if (key2 === 'results') updCh.standings = val;
    db.update('tournaments', tid2, { channels: updCh });
    return interaction.reply({ content: `✅ **${key2}** → ${val ? `<#${val}>` : 'cleared'}.`, flags: 64 });
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
  // ── Winners Setup ────────────────────────────────────────────────────────
  if (id === 'mgr2_winners') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    return interaction.update(buildWinnersSubPanel());
  }

  // Set winners history category
  if (id === 'mgr2_winners_setup') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const cur = db.getConfig('winners_history_category') || '';
    return interaction.showModal(
      new ModalBuilder().setCustomId('mgr2_winners_setup_modal').setTitle('Winners History Category')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('category_id').setLabel('Category ID (right-click → Copy ID)')
              .setStyle(TextInputStyle.Short).setValue(cur).setPlaceholder('1234567890123456789').setRequired(true)
          ),
        )
    );
  }

  if (id === 'mgr2_winners_setup_modal') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const catId = interaction.fields.getTextInputValue('category_id').trim().replace(/\D/g, '');
    if (!catId) return interaction.reply({ content: '❌ Invalid category ID.', ephemeral: true });
    db.setConfig('winners_history_category', catId);
    await interaction.update(buildWinnersSubPanel());
    return interaction.followUp({ content: `✅ Winners History category set to <#${catId}>.`, ephemeral: true });
  }

  // Set winner role for a tournament
  if (id === 'mgr2_winner_role_start') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tournaments = db.get('tournaments');
    if (!tournaments.length) return interaction.reply({ content: '❌ No tournaments.', ephemeral: true });
    const SEP2 = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xFFD700, components: [
        { type: 10, content: '**🏆 Set Winner Role — Select a tournament**' },
        SEP2,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_winner_role_sel', placeholder: 'Select tournament...',
          options: tournaments.slice(0, 25).map(t => ({
            label: t.name.slice(0, 100), value: String(t.id),
            description: `S${t.season} · ${t.winner_role_id ? 'Role set' : 'No role'}`,
          })),
        }]},
        SEP2,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_winners' }]},
      ]}],
    });
  }

  if (id === 'mgr2_winner_role_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid2 = parseInt(interaction.values[0]);
    const t2   = db.findById('tournaments', tid2);
    if (!t2) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_winner_role_modal_${tid2}`).setTitle(`Winner Role — ${t2.name.slice(0, 30)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_id').setLabel('Winner Role ID (right-click role → Copy ID)')
              .setStyle(TextInputStyle.Short).setValue(t2.winner_role_id || '').setPlaceholder('1234567890123456789').setRequired(false)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_winner_role_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid3   = parseInt(id.replace('mgr2_winner_role_modal_', ''));
    const roleId = interaction.fields.getTextInputValue('role_id').trim().replace(/\D/g, '') || null;
    db.update('tournaments', tid3, { winner_role_id: roleId });
    await interaction.update(buildWinnersSubPanel());
    return interaction.followUp({
      content: roleId ? `✅ Winner role set to <@&${roleId}>.` : '✅ Winner role cleared.',
      ephemeral: true,
    });
  }

  // Set winners history message reference for a tournament
  if (id === 'mgr2_winref_start') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tournaments = db.get('tournaments');
    if (!tournaments.length) return interaction.reply({ content: '❌ No tournaments.', ephemeral: true });
    const SEP3 = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xFFD700, components: [
        { type: 10, content: '**🏆 Set Winners History Message — Select a tournament**' },
        SEP3,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_winref_sel', placeholder: 'Select tournament...',
          options: tournaments.slice(0, 25).map(t => ({
            label: t.name.slice(0, 100), value: String(t.id),
            description: `S${t.season} · ${t.winners_history_ref ? 'Ref set' : 'No ref'}`,
          })),
        }]},
        SEP3,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_winners' }]},
      ]}],
    });
  }

  if (id === 'mgr2_winref_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid4 = parseInt(interaction.values[0]);
    const t4   = db.findById('tournaments', tid4);
    if (!t4) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    const curRef = t4.winners_history_ref || {};
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_winref_modal_${tid4}`).setTitle(`History Msg — ${t4.name.slice(0, 28)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID of the winners history channel')
              .setStyle(TextInputStyle.Short).setValue(curRef.channelId || '').setPlaceholder('1234567890123456789').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('message_id').setLabel('Message ID of the persistent leaderboard')
              .setStyle(TextInputStyle.Short).setValue(curRef.messageId || '').setPlaceholder('1234567890123456789').setRequired(true)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_winref_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid5  = parseInt(id.replace('mgr2_winref_modal_', ''));
    const chId  = interaction.fields.getTextInputValue('channel_id').trim().replace(/\D/g, '');
    const msgId = interaction.fields.getTextInputValue('message_id').trim().replace(/\D/g, '');
    if (!chId || !msgId) return interaction.reply({ content: '❌ Invalid channel or message ID.', ephemeral: true });
    db.update('tournaments', tid5, { winners_history_ref: { channelId: chId, messageId: msgId } });
    await interaction.update(buildWinnersSubPanel());
    return interaction.followUp({
      content: `✅ Winners History message linked: <#${chId}> / \`${msgId}\`.`,
      ephemeral: true,
    });
  }

}

module.exports = { handleMgr2Interaction };

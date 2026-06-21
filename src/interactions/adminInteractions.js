'use strict';
const { buildAdminPanel, buildChannelPickerPanel, buildTestChannelPickerPanel } = require('../panels/adminPanel');
const { buildWinnersHistoryPayload } = require('../utils/winnersHistory');
const { set: tmpSet, get: tmpGet } = require('../utils/tempState');
const { db } = require('../utils/database');

// Auto-delete a short text feedback reply after 5 s
async function admTextReply(interaction, content) {
  const msg = await interaction.reply({ content, ephemeral: true });
  setTimeout(() => interaction.deleteReply().catch(() => {}), 5_000);
  return msg;
}

async function handleAdminInteraction(interaction, client) {
  const id = interaction.customId;

  if (id === 'adm_refresh' || id === 'adm_done') {
    return interaction.update(buildAdminPanel());
  }

  if (id === 'adm_tch_EL' || id === 'adm_tch_CL') {
    const template = id.replace('adm_tch_', '');
    return interaction.reply({ ...buildChannelPickerPanel(template), ephemeral: true });
  }

  if (id === 'adm_tch_TEST') {
    return interaction.reply({ ...buildTestChannelPickerPanel(), ephemeral: true });
  }

  if (id === 'adm_ch_TEST_testpanel') {
    const channelId = interaction.values[0] || null;
    db.setConfig('test_channel_id', channelId);
    return interaction.update(buildTestChannelPickerPanel());
  }

  if (id.startsWith('adm_ch_')) {
    const parts     = id.split('_');
    const template  = parts[2];
    const key       = parts[3];
    const channelId = interaction.values[0] || null;

    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    db.update('tournaments', t.id, {
      channels: { ...(t.channels || {}), [key]: channelId },
    });

    return interaction.update(buildChannelPickerPanel(template));
  }

  if (id.startsWith('adm_setregrole_') && !id.includes('_modal_')) {
    const template = id.replace('adm_setregrole_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`adm_setregrole_modal_${template}`)
        .setTitle(`Set ${template} Registration Role`)
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('role_id')
            .setLabel('Role ID — right-click role → Copy ID. Blank = remove.')
            .setStyle(TextInputStyle.Short)
            .setValue(t.registration_role_id || '')
            .setPlaceholder('1234567890123456789')
            .setRequired(false)
        ))
    );
  }

  if (id.startsWith('adm_setregrole_modal_')) {
    const template = id.replace('adm_setregrole_modal_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    const raw    = interaction.fields.getTextInputValue('role_id').trim();
    const roleId = raw.replace(/[^0-9]/g, '') || null;
    db.update('tournaments', t.id, { registration_role_id: roleId });

    await admTextReply(interaction, roleId
        ? `✅ **${template}** registration role set to <@&${roleId}>. Players will receive it on enrollment.`
        : `✅ **${template}** registration role cleared.`);
    return interaction.update(buildAdminPanel());
  }

  // ── Rename Tournament ────────────────────────────────────────────────────
  if (id.startsWith('adm_rename_') && !id.includes('_modal_')) {
    const template = id.replace('adm_rename_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`adm_rename_modal_${template}`)
        .setTitle(`Rename ${template} Tournament`)
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('new_name')
            .setLabel('New tournament name')
            .setStyle(TextInputStyle.Short)
            .setValue(t.name)
            .setPlaceholder('e.g. EL')
            .setMaxLength(50)
            .setRequired(true)
        ))
    );
  }

  if (id.startsWith('adm_rename_modal_')) {
    const template = id.replace('adm_rename_modal_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    const newName = interaction.fields.getTextInputValue('new_name').trim();
    if (!newName) return admTextReply(interaction, '❌ Name cannot be empty.');

    const oldName = t.name;
    db.update('tournaments', t.id, { name: newName });

    await interaction.deferUpdate();
    await interaction.editReply(buildAdminPanel());
    return interaction.followUp({
      content: `✅ Renamed **${oldName}** → **${newName}**. All panels and posts will now use the new name.`,
      ephemeral: true,
    });
  }

// ── Winner History handlers (adm_wh_*) ──────────────────────────────────────
  if (id === 'adm_wh_home') {
    return interaction.update(buildWHHome());
  }

  if (id.startsWith('adm_wh_t_')) {
    const tid = parseInt(id.replace('adm_wh_t_', ''));
    return interaction.update(buildWHPanel(tid));
  }

  if (id.startsWith('adm_wh_add_') && !id.includes('modal')) {
    const tid = parseInt(id.replace('adm_wh_add_', ''));
    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('adm_wh_addmodal_' + tid)
        .setTitle('Add Winner')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('season').setLabel('Season number').setStyle(TextInputStyle.Short).setPlaceholder('e.g. 17').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team').setLabel('Team name').setStyle(TextInputStyle.Short).setPlaceholder('e.g. Morocco').setRequired(true)
          )
        )
    );
  }

  if (id.startsWith('adm_wh_addmodal_')) {
    const tid     = parseInt(id.replace('adm_wh_addmodal_', ''));
    const season  = parseInt(interaction.fields.getTextInputValue('season').trim()) || 0;
    const teamName = interaction.fields.getTextInputValue('team').trim();
    if (!season || !teamName) return interaction.reply({ content: '❌ Season and team name are required.', ephemeral: true });
    tmpSet('wh_' + interaction.user.id + '_' + tid, { season, teamName, playerIds: [] });
    return interaction.reply({ ...buildWHPlayerSelect(tid, season, teamName, []), ephemeral: true });
  }

  if (id.startsWith('adm_wh_playersel_')) {
    const tid = parseInt(id.replace('adm_wh_playersel_', ''));
    const pending = tmpGet('wh_' + interaction.user.id + '_' + tid);
    const playerIds = interaction.values || [];
    if (pending) {
      pending.playerIds = playerIds;
      tmpSet('wh_' + interaction.user.id + '_' + tid, pending);
    }
    const season   = pending ? pending.season   : '?';
    const teamName = pending ? pending.teamName : '?';
    return interaction.update(buildWHPlayerSelect(tid, season, teamName, playerIds));
  }

  if (id.startsWith('adm_wh_confirmadd_')) {
    const tid     = parseInt(id.replace('adm_wh_confirmadd_', ''));
    const pending = tmpGet('wh_' + interaction.user.id + '_' + tid);
    if (!pending) return interaction.update({ content: '❌ Session expired. Please start over.', components: [] });
    await interaction.deferUpdate();

    const { season, teamName, playerIds } = pending;
    const teams  = db.get('teams');
    const found  = teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
    const teamId = found ? found.id : null;

    db.insert('winners', {
      tournament_id: tid,
      season,
      team_id:    teamId,
      team_name:  found ? undefined : teamName,
      player_ids: playerIds,
      confirmed_by: interaction.user.id,
    });

    // Update history message if ref exists
    const t   = db.findById('tournaments', tid);
    const ref = t && t.winners_history_ref;
    let msgStatus = '';
    if (ref && ref.channelId && ref.messageId) {
      try {
        const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
        const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
        if (msg) { await msg.edit(buildWinnersHistoryPayload(tid)).catch(() => {}); msgStatus = ' • History message updated ✅'; }
        else       msgStatus = ' • ⚠️ Could not find history message';
      } catch { msgStatus = ' • ⚠️ Failed to update history message'; }
    } else {
      msgStatus = ' • ⚠️ No history message linked (use Update/Post)';
    }

    const successPanel = {
      flags: 32768,
      components: [{ type: 17, accent_color: 0x57F287, components: [
        { type: 10, content: '# ✅  Winner Added\n> **S' + season + '** — **' + teamName + '**' + msgStatus },
        { type: 14, divider: true, spacing: 1 },
        { type: 1, components: [{ type: 2, style: 2, label: '← Back to History', custom_id: 'adm_wh_t_' + tid }] },
      ]}],
    };
    return interaction.editReply(successPanel);
  }

  if (id.startsWith('adm_wh_post_')) {
    const tid = parseInt(id.replace('adm_wh_post_', ''));
    await interaction.deferUpdate();
    const t   = db.findById('tournaments', tid);
    if (!t) return interaction.editReply({ content: '❌ Tournament not found.' });
    const ref     = t.winners_history_ref;
    const payload = buildWinnersHistoryPayload(tid);

    if (ref && ref.channelId && ref.messageId) {
      // Try to edit existing message
      try {
        const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
        const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
        if (msg) {
          await msg.edit(payload);
          return interaction.editReply(buildWHPanel(tid));
        }
      } catch {}
      // Message not found — post new
    }
    // Post new message
    if (ref && ref.channelId) {
      try {
        const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
        if (!ch) { return interaction.editReply({ content: '❌ Channel not found. Set the channel first.' }); }
        const msg = await ch.send(payload);
        db.update('tournaments', tid, { winners_history_ref: { channelId: ref.channelId, messageId: msg.id } });
        return interaction.editReply(buildWHPanel(db.findById('tournaments', tid)));
      } catch (e) {
        return interaction.editReply({ content: '❌ Failed to post: ' + e.message });
      }
    } else {
      return interaction.editReply({ content: '❌ No channel configured. Use **📌 Set Channel** first.' });
    }
  }

  if (id.startsWith('adm_wh_setch_') && !id.startsWith('adm_wh_setchmodal_')) {
    const tid = parseInt(id.replace('adm_wh_setch_', ''));
    return interaction.update(buildWHSetChannel(tid));
  }

  if (id.startsWith('adm_wh_ch_')) {
    const tid     = parseInt(id.replace('adm_wh_ch_', ''));
    const chId    = interaction.values[0] || null;
    if (!chId) return interaction.update(buildWHSetChannel(tid));
    const t   = db.findById('tournaments', tid);
    const ref = (t && t.winners_history_ref) || {};
    db.update('tournaments', tid, { winners_history_ref: { ...ref, channelId: chId } });
    return interaction.update(buildWHPanel(tid));
  }

  if (id.startsWith('adm_wh_setmsg_') && !id.includes('modal')) {
    const tid = parseInt(id.replace('adm_wh_setmsg_', ''));
    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const t   = db.findById('tournaments', tid);
    const ref = (t && t.winners_history_ref) || {};
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('adm_wh_setmsgmodal_' + tid)
        .setTitle('Link Existing Message')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('msg_id').setLabel('Message ID').setStyle(TextInputStyle.Short)
              .setValue(ref.messageId || '').setPlaceholder('Right-click message → Copy ID').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('ch_id').setLabel('Channel ID (leave blank to keep current)').setStyle(TextInputStyle.Short)
              .setValue(ref.channelId || '').setPlaceholder('Right-click channel → Copy ID').setRequired(false)
          )
        )
    );
  }

  if (id.startsWith('adm_wh_setmsgmodal_')) {
    const tid   = parseInt(id.replace('adm_wh_setmsgmodal_', ''));
    const msgId = interaction.fields.getTextInputValue('msg_id').trim().replace(/[^0-9]/g, '');
    const chRaw = interaction.fields.getTextInputValue('ch_id').trim().replace(/[^0-9]/g, '');
    if (!msgId) return interaction.reply({ content: '❌ Message ID is required.', ephemeral: true });
    const t   = db.findById('tournaments', tid);
    const ref = (t && t.winners_history_ref) || {};
    db.update('tournaments', tid, { winners_history_ref: { channelId: chRaw || ref.channelId || null, messageId: msgId } });
    return interaction.reply({ ...buildWHPanel(tid), ephemeral: true });
  }

  if (id.startsWith('adm_wh_del_') && !id.includes('modal')) {
    const tid = parseInt(id.replace('adm_wh_del_', ''));
    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('adm_wh_delmodal_' + tid)
        .setTitle('Delete Winner Entry')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('season').setLabel('Season number to delete').setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. 15').setRequired(true)
          )
        )
    );
  }

  if (id.startsWith('adm_wh_delmodal_')) {
    const tid    = parseInt(id.replace('adm_wh_delmodal_', ''));
    const season = parseInt(interaction.fields.getTextInputValue('season').trim());
    if (!season) return interaction.reply({ content: '❌ Invalid season number.', ephemeral: true });
    const existing = db.findOne('winners', w => w.tournament_id === tid && w.season === season);
    if (!existing) return interaction.reply({ content: '❌ No winner entry found for Season ' + season + '.', ephemeral: true });
    db.deleteWhere('winners', w => w.tournament_id === tid && w.season === season);

    // Update history message
    const t   = db.findById('tournaments', tid);
    const ref = t && t.winners_history_ref;
    if (ref && ref.channelId && ref.messageId) {
      try {
        const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
        const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
        if (msg) await msg.edit(buildWinnersHistoryPayload(tid)).catch(() => {});
      } catch {}
    }
    return interaction.reply({ ...buildWHPanel(tid), ephemeral: true });
  }


}

module.exports = { handleAdminInteraction };

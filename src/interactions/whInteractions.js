'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { set: tmpSet, get: tmpGet } = require('../utils/tempState');
const { buildWHMain, buildWHPanel, buildWHUserSelect, buildWHSetChannel } = require('../panels/whPanel');
const { buildWinnersHistoryPayload } = require('../utils/winnersHistory');

function getWHT() { return db.get('wh_tournaments') || []; }

async function handleWHInteraction(interaction, client) {
  const id = interaction.customId || '';

  // ── Home ──────────────────────────────────────────────────────────────────
  if (id === 'wh_home') {
    return interaction.update(buildWHMain());
  }

  // ── Tournament select menu ────────────────────────────────────────────────
  if (id === 'wh_sel') {
    const tid = parseInt(interaction.values[0]);
    return interaction.update(buildWHPanel(tid));
  }

  // ── View tournament ───────────────────────────────────────────────────────
  if (id.startsWith('wh_t_')) {
    const tid = parseInt(id.replace('wh_t_', ''));
    return interaction.update(buildWHPanel(tid));
  }

  // ── Add tournament button ─────────────────────────────────────────────────
  if (id === 'wh_addtmt') {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('wh_addtmt_modal')
        .setTitle('Add Tournament')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Tournament name')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. Elite League')
              .setRequired(true)
          )
        )
    );
  }

  // ── Add tournament modal ──────────────────────────────────────────────────
  if (id === 'wh_addtmt_modal') {
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name) return interaction.reply({ content: '\u274c Name required.', ephemeral: true });
    const rec = db.insert('wh_tournaments', { name, channelId: null, messageId: null });
    return interaction.reply({ ...buildWHPanel(rec.id), ephemeral: true });
  }

  // ── Add winner button → modal ─────────────────────────────────────────────
  if (id.startsWith('wh_add_') && !id.includes('modal') && !id.includes('confirm') && !id.includes('usersel')) {
    const tid = parseInt(id.replace('wh_add_', ''));
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('wh_addmodal_' + tid)
        .setTitle('Add Winner')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('season')
              .setLabel('Season number')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. 17')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Winner name (if not in server)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. Ragnar  (leave blank if tagging)')
              .setRequired(false)
          )
        )
    );
  }

  // ── Add winner modal submitted → show user select ─────────────────────────
  if (id.startsWith('wh_addmodal_')) {
    const tid      = parseInt(id.replace('wh_addmodal_', ''));
    const season   = parseInt(interaction.fields.getTextInputValue('season').trim());
    const nameRaw  = interaction.fields.getTextInputValue('name').trim();
    if (!season) return interaction.reply({ content: '\u274c Invalid season number.', ephemeral: true });
    tmpSet('wh_' + interaction.user.id + '_' + tid, { season, nameOrTag: nameRaw, playerIds: [] });
    return interaction.reply({
      ...buildWHUserSelect(tid, season, nameRaw || '(will use Discord tag)', []),
      ephemeral: true,
    });
  }

  // ── User select ───────────────────────────────────────────────────────────
  if (id.startsWith('wh_usersel_')) {
    const tid      = parseInt(id.replace('wh_usersel_', ''));
    const pending  = tmpGet('wh_' + interaction.user.id + '_' + tid) || {};
    const ids      = interaction.values || [];
    pending.playerIds = ids;
    tmpSet('wh_' + interaction.user.id + '_' + tid, pending);
    const display  = ids.length ? ids.map(p => '<@' + p + '>').join(' ') : (pending.nameOrTag || '(none)');
    return interaction.update(buildWHUserSelect(tid, pending.season, display, ids));
  }

  // ── Confirm add winner ────────────────────────────────────────────────────
  if (id.startsWith('wh_confirm_')) {
    const tid     = parseInt(id.replace('wh_confirm_', ''));
    const pending = tmpGet('wh_' + interaction.user.id + '_' + tid);
    if (!pending) return interaction.update({ content: '\u274c Session expired. Start over.', components: [] });
    await interaction.deferUpdate();
    const { season, nameOrTag, playerIds } = pending;
    db.insert('winners', {
      wh_tournament_id: tid,
      season,
      team_name: nameOrTag || null,
      player_ids: playerIds || [],
      confirmed_by: interaction.user.id,
    });
    const t = getWHT().find(t => t.id === tid);
    if (t && t.channelId && t.messageId && client) {
      try {
        const ch  = await client.channels.fetch(t.channelId).catch(() => null);
        const msg = ch && await ch.messages.fetch(t.messageId).catch(() => null);
        if (msg) await msg.edit(buildWinnersHistoryPayload(tid)).catch(() => {});
      } catch (_) {}
    }
    return interaction.editReply(buildWHPanel(tid));
  }

  // ── Post / Update ─────────────────────────────────────────────────────────
  if (id.startsWith('wh_post_')) {
    const tid  = parseInt(id.replace('wh_post_', ''));
    await interaction.deferUpdate();
    const list = getWHT();
    const t    = list.find(t => t.id === tid);
    if (!t)           return interaction.editReply({ content: '\u274c Tournament not found.' });
    if (!t.channelId) return interaction.editReply({ content: '\u274c Set a channel first with \ud83d\udccc Set Channel.' });
    const payload = buildWinnersHistoryPayload(tid);
    try {
      const ch = await client.channels.fetch(t.channelId).catch(() => null);
      if (!ch) return interaction.editReply({ content: '\u274c Channel not found.' });
      if (t.messageId) {
        const msg = await ch.messages.fetch(t.messageId).catch(() => null);
        if (msg) { await msg.edit(payload); return interaction.editReply(buildWHPanel(tid)); }
      }
      const newMsg = await ch.send(payload);
      db.update('wh_tournaments', tid, { messageId: newMsg.id });
      return interaction.editReply(buildWHPanel(tid));
    } catch (e) {
      return interaction.editReply({ content: '\u274c Failed: ' + e.message });
    }
  }

  // ── Set channel button ────────────────────────────────────────────────────
  if (id.startsWith('wh_setch_')) {
    const tid = parseInt(id.replace('wh_setch_', ''));
    return interaction.update(buildWHSetChannel(tid));
  }

  // ── Channel selected ──────────────────────────────────────────────────────
  if (id.startsWith('wh_ch_')) {
    const tid = parseInt(id.replace('wh_ch_', ''));
    const chId = interaction.values[0];
    db.update('wh_tournaments', tid, { channelId: chId });
    return interaction.update(buildWHPanel(tid));
  }

  // ── Remove winner button → modal ──────────────────────────────────────────
  if (id.startsWith('wh_del_') && !id.includes('modal')) {
    const tid = parseInt(id.replace('wh_del_', ''));
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('wh_delmodal_' + tid)
        .setTitle('Remove Winner')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('season')
              .setLabel('Season number to remove')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. 5')
              .setRequired(true)
          )
        )
    );
  }

  // ── Remove winner modal ───────────────────────────────────────────────────
  if (id.startsWith('wh_delmodal_')) {
    const tid    = parseInt(id.replace('wh_delmodal_', ''));
    const season = parseInt(interaction.fields.getTextInputValue('season').trim());
    if (!season) return interaction.reply({ content: '\u274c Invalid season number.', ephemeral: true });
    const exists = (db.get('winners') || []).find(w => w.wh_tournament_id === tid && w.season === season);
    if (!exists) return interaction.reply({ content: '\u274c No winner found for Saison ' + season + '.', ephemeral: true });
    db.deleteWhere('winners', w => w.wh_tournament_id === tid && w.season === season);
    const t = getWHT().find(t => t.id === tid);
    if (t && t.channelId && t.messageId && client) {
      try {
        const ch  = await client.channels.fetch(t.channelId).catch(() => null);
        const msg = ch && await ch.messages.fetch(t.messageId).catch(() => null);
        if (msg) await msg.edit(buildWinnersHistoryPayload(tid)).catch(() => {});
      } catch (_) {}
    }
    return interaction.reply({ ...buildWHPanel(tid), ephemeral: true });
  }
}

module.exports = { handleWHInteraction };

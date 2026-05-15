'use strict';
const { buildAdminPanel, buildTournamentChannelModal } = require('../panels/adminPanel');
const { db } = require('../utils/database');

async function handleAdminInteraction(interaction) {
  const id = interaction.customId;

  // ── Refresh ────────────────────────────────────────────────────────────────
  if (id === 'adm_refresh') {
    return interaction.update(buildAdminPanel());
  }

  // ── Set Tournament Channels buttons ────────────────────────────────────────
  if (id === 'adm_tch_NSEL' || id === 'adm_tch_MCL') {
    const template = id.replace('adm_tch_', '');
    return interaction.showModal(buildTournamentChannelModal(template));
  }

  // ── Tournament channel modal submit ────────────────────────────────────────
  if (id.startsWith('adm_tch_modal_')) {
    const template  = id.replace('adm_tch_modal_', '');
    const schedule  = interaction.fields.getTextInputValue('schedule').trim()  || null;
    const results   = interaction.fields.getTextInputValue('results').trim()   || null;
    const standings = interaction.fields.getTextInputValue('standings').trim() || null;

    const t = db.get('tournaments').find(t2 => t2.template === template);
    if (!t) return interaction.reply({ content: `❌ No ${template} tournament found.`, ephemeral: true });

    const existing = t.channels || {};
    db.update('tournaments', t.id, {
      channels: { ...existing, schedule, results, standings },
    });

    await refreshAdminPanel(interaction.client);
    return interaction.reply({ content: `✅ ${template} channels saved.`, ephemeral: true });
  }
}

async function refreshAdminPanel(client) {
  try {
    const ref = db.getConfig('adminpanel_ref');
    if (!ref) return;
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (msg) await msg.edit(buildAdminPanel()).catch(() => {});
  } catch {}
}

module.exports = { handleAdminInteraction };

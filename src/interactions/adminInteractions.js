'use strict';
const { buildAdminPanel, buildChannelConfigModal } = require('../panels/adminPanel');
const { requireManager } = require('../utils/permissions');
const { db } = require('../utils/database');

async function handleAdminInteraction(interaction) {
  const id = interaction.customId;

  // ── Refresh ───────────────────────────────────────────────────────────────
  if (id === 'adm_refresh') {
    return interaction.update(buildAdminPanel());
  }

  // ── Set channels buttons ──────────────────────────────────────────────────
  if (id === 'adm_set_MCL' || id === 'adm_set_NSEL') {
    const template = id.split('_')[2];
    return interaction.showModal(buildChannelConfigModal(template));
  }

  // ── Channel config modal submit ───────────────────────────────────────────
  if (id.startsWith('adm_channels_modal_')) {
    const template   = id.replace('adm_channels_modal_', '');
    const teamsList  = interaction.fields.getTextInputValue('teamsList').trim();
    const results    = interaction.fields.getTextInputValue('results').trim();
    const matchSched = interaction.fields.getTextInputValue('matchSchedule').trim();
    const groupDraw  = interaction.fields.getTextInputValue('groupDraw').trim();

    const config = db.get('config') || {};
    if (!config.channels) config.channels = {};
    config.channels[template] = { teamsList, results, matchSchedule: matchSched, groupDraw };
    db.setConfig('channels', config.channels);

    // Refresh the stored admin panel message
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

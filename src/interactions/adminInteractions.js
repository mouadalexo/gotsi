'use strict';
const { buildAdminPanel, buildChannelPickerPanel } = require('../panels/adminPanel');
const { db } = require('../utils/database');

async function handleAdminInteraction(interaction) {
  // Auto-delete ephemeral replies so admin sub-panels are temporary
  const _origReply = interaction.reply.bind(interaction);
  interaction.reply = async (opts) => {
    const r = await _origReply(opts);
    if (opts && opts.ephemeral) setTimeout(() => interaction.deleteReply().catch(() => {}), 8_000);
    return r;
  };
  const id = interaction.customId;

  if (id === 'adm_refresh' || id === 'adm_done') {
    return interaction.update(buildAdminPanel());
  }

  if (id === 'adm_tch_NSEL' || id === 'adm_tch_MCL') {
    const template = id.replace('adm_tch_', '');
    return interaction.reply({ ...buildChannelPickerPanel(template), ephemeral: true });
  }

  // adm_ch_{TEMPLATE}_{key}  — ChannelSelectMenu saved immediately on change
  if (id.startsWith('adm_ch_')) {
    const parts     = id.split('_');     // ['adm','ch','NSEL','management']
    const template  = parts[2];
    const key       = parts[3];
    const channelId = interaction.values[0] || null;

    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return interaction.reply({ content: `❌ No ${template} tournament found.`, ephemeral: true });

    db.update('tournaments', t.id, {
      channels: { ...(t.channels || {}), [key]: channelId },
    });

    return interaction.update(buildChannelPickerPanel(template));
  }
}

module.exports = { handleAdminInteraction };

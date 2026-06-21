'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { db } = require('../utils/database');
const { isBotolaManager } = require('../utils/permissions');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

const VALID = /^(EL|CL)$/i;

function buildPanelsListPanel() {
  const tournaments = db.get('tournaments')
    .filter(t => VALID.test(t.template || '') || VALID.test(t.name || ''))
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const inner = [];
  inner.push(txt(`## Management Panels`));
  inner.push(SEP);
  inner.push(txt('Select a tournament below to open its management panels.'));
  inner.push(SEP);

  if (!tournaments.length) {
    inner.push(txt('No tournaments found. Create one via `/admin`.'));
  } else {
    const options = tournaments.slice(0, 25).map(t => {
      const statusLabel = t.status === 'active' ? 'Active' : t.status === 'finished' ? 'Finished' : 'Setup';
      return {
        label: t.name.slice(0, 100),
        description: (`${statusLabel} — ${t.template || t.name}`).slice(0, 100),
        value: String(t.id),
      };
    });
    inner.push({ type: 1, components: [{ type: 3, custom_id: 'bot_sel_t', placeholder: 'Select a tournament…', options }] });
  }

  inner.push({ type: 1, components: [
    { type: 2, style: 2, label: '⚙️  Settings Panel', custom_id: 'stp_open' },
  ]});
  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));
  return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panels')
    .setDescription('Select a tournament to open its management panels'),

  async execute(interaction) {
    if (!isBotolaManager(interaction.member)) {
      return interaction.reply({ content: '❌ You need the **Manager** role to use this command.', ephemeral: true });
    }
    await interaction.reply({ ...buildPanelsListPanel(), ephemeral: true });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 30_000);
  },

  buildPanelsListPanel,
};

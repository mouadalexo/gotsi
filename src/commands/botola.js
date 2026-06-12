'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { db } = require('../utils/database');
const { isBotolaManager } = require('../utils/permissions');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

const VALID = /^(EL|MCL)$/i;

function buildBotolaListPanel() {
  const tournaments = db.get('tournaments')
    .filter(t => VALID.test(t.template || '') || VALID.test(t.name || ''))
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const E_CUP = '<a:cup:1501741159557500971>';
  const inner = [];
  inner.push(txt(`**${E_CUP}  Botola \u2014 Tournament Hub**\n> Select a tournament to open its management panels.`));
  inner.push(SEP);

  if (!tournaments.length) {
    inner.push(txt('No tournaments yet. Create one via `/manage \u2192 New Tournament`.'));
  } else {
    const statusIcon = { setup: '\u2699\ufe0f', active: '\ud83d\udfe2', finished: '\ud83c\udfc1' };
    const lines = tournaments.map(t =>
      `${statusIcon[t.status] || '\u2699\ufe0f'}  **${t.name}**  \u2014  S${t.season}  \`${t.status}\``
    );
    inner.push(txt(lines.join('\n')));
    inner.push(SEP);
    inner.push(txt('-# Click a button below to open panels for that tournament in the configured channels.'));
    inner.push(SEP);

    const shown = tournaments.slice(0, 20);
    for (let i = 0; i < shown.length; i += 5) {
      const chunk = shown.slice(i, i + 5);
      inner.push({
        type: 1,
        components: chunk.map(t => ({
          type: 2,
          style: t.status === 'active' ? 1 : 2,
          label: t.name.slice(0, 20),
          custom_id: `bot_t_${t.id}`,
        })),
      });
    }
  }

  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));
  return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botola')
    .setDescription('Tournament hub \u2014 open management panels for a tournament'),

  async execute(interaction) {
    if (!isBotolaManager(interaction.member)) {
      return interaction.reply({ content: '\u274c You need the **Manager** role to use this command.', ephemeral: true });
    }
    await interaction.reply({ ...buildBotolaListPanel(), ephemeral: true });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 30_000);
  },

  buildBotolaListPanel,
};

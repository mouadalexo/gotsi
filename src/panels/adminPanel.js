'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

const E_CUP  = '<a:cup:1501741159557500971>';
const E_HASH = '<a:hashtag:1501741088736678069>';

function chLine(t, key) {
  const id = t?.channels?.[key];
  return id ? `<#${id}>` : '`not set`';
}

function buildAdminPanel() {
  const nsel = db.get('tournaments').find(t => t.template === 'NSEL');
  const mcl  = db.get('tournaments').find(t => t.template === 'MCL');

  const inner = [
    txt(`# ${E_CUP}  Admin Setup\nTournament channels — admin only.`),
    SEP,
  ];

  if (nsel) {
    inner.push(txt(
      `${E_HASH}  **NSEL — Season ${nsel.season}**\n` +
      `Schedule → ${chLine(nsel,'schedule')}\n` +
      `Results → ${chLine(nsel,'results')}\n` +
      `Standings → ${chLine(nsel,'standings')}`
    ));
    inner.push(SEP);
  }

  if (mcl) {
    inner.push(txt(
      `${E_HASH}  **MCL — Season ${mcl.season}**\n` +
      `Schedule → ${chLine(mcl,'schedule')}\n` +
      `Results → ${chLine(mcl,'results')}\n` +
      `Standings → ${chLine(mcl,'standings')}`
    ));
    inner.push(SEP);
  }

  inner.push({ type: 1, components: [
    { type: 2, style: 1, label: 'Set NSEL Channels', custom_id: 'adm_tch_NSEL', disabled: !nsel },
    { type: 2, style: 1, label: 'Set MCL Channels',  custom_id: 'adm_tch_MCL',  disabled: !mcl  },
    { type: 2, style: 2, label: 'Refresh',           custom_id: 'adm_refresh'  },
  ]});

  inner.push(SEP);
  inner.push(txt('-# Night Stars  •  Admin Setup  •  Admins only'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

function buildTournamentChannelModal(template) {
  const t  = db.get('tournaments').find(t2 => t2.template === template);
  const ch = t?.channels || {};
  return new ModalBuilder()
    .setCustomId(`adm_tch_modal_${template}`)
    .setTitle(`Set ${template} Channels`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('schedule').setLabel('Schedule Channel ID')
          .setStyle(TextInputStyle.Short).setValue(ch.schedule || '').setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('results').setLabel('Results Channel ID')
          .setStyle(TextInputStyle.Short).setValue(ch.results || '').setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('standings').setLabel('Standings Channel ID')
          .setStyle(TextInputStyle.Short).setValue(ch.standings || '').setRequired(false)
      ),
    );
}

module.exports = { buildAdminPanel, buildTournamentChannelModal };

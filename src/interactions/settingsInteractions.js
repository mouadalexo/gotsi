'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db }              = require('../utils/database');
const { isBotolaManager } = require('../utils/permissions');
const { buildSettingsPanel, buildSettingsPost, getSettings } = require('../panels/settingsPanel');

function noPermission(i) {
  return i.reply({ content: '❌ Managers only.', ephemeral: true });
}

// Extract the Discord user ID embedded in a custom_id
// Handles patterns like stp_xxx_<uid> or stp_cfg_<uid>_field or stp_tog_<uid>_field_val
function uidFrom(id) {
  const m = id.match(/_(\d{15,20})(?:_|$)/);
  return m ? m[1] : null;
}

function wrongPanel(i) {
  return i.reply({ content: '❌ This is not your settings panel.', ephemeral: true });
}

const BOOL_FIELDS = new Set(['injuries', 'extraTime', 'penalties', 'extraSubET']);

async function handleSettingsInteraction(interaction) {
  const id  = interaction.customId || '';
  const uid = interaction.user.id;

  if (!isBotolaManager(interaction.member)) return noPermission(interaction);

  // ── stp_open: post settings panel to channel ──────────────────────────────
  if (id === 'stp_open') {
    await interaction.deferReply({ ephemeral: false });
    return interaction.editReply(buildSettingsPanel(uid));
  }

  // ── stp_refresh_<uid> ─────────────────────────────────────────────────────
  if (id.startsWith('stp_refresh_')) {
    return interaction.update(buildSettingsPanel(uidFrom(id)));
  }

  // ── stp_tog_<uid>_<field>_<on|off>: toggle button clicked ────────────────
  // custom_id = stp_tog_<uid>_<field>_on  → set field to true
  // custom_id = stp_tog_<uid>_<field>_off → set field to false
  if (id.startsWith('stp_tog_')) {
    const m = id.match(/^stp_tog_(\d+)_([a-zA-Z]+)_(on|off)$/);
    if (!m) return;
    const [, uidFromId, field, nextState] = m;
    const s  = getSettings(uidFromId);
    s[field] = nextState === 'on';
    db.setConfig('stp_' + uidFromId, s);
    return interaction.update(buildSettingsPanel(uidFromId));
  }

  // ── stp_cfg_<uid>_<field>: select menu changed ────────────────────────────
  if (id.startsWith('stp_cfg_')) {
    const m = id.match(/^stp_cfg_(\d+)_(.+)$/);
    if (!m) return;
    const [, uidFromId, field] = m;
    const val = interaction.values[0];
    const s   = getSettings(uidFromId);
    if (field === 'condition') {
      s[field] = val;
    } else {
      s[field] = Number(val);
    }
    db.setConfig('stp_' + uidFromId, s);
    return interaction.update(buildSettingsPanel(uidFromId));
  }

  // ── stp_settitle_<uid>: open title modal ──────────────────────────────────
  if (id.startsWith('stp_settitle_') && !id.includes('modal')) {
    const s = getSettings(uidFrom(id));
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`stp_settitle_modal_${uid}`)
        .setTitle('Set Post Title')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('title')
              .setLabel('Post Title')
              .setStyle(TextInputStyle.Short)
              .setValue(s.title || 'Match Settings')
              .setMaxLength(80)
              .setRequired(true)
          )
        )
    );
  }

  // ── stp_settitle_modal_<uid>: title saved ─────────────────────────────────
  if (id.startsWith('stp_settitle_modal_')) {
    const _u = uidFrom(id);
    const s = getSettings(_u);
    s.title  = interaction.fields.getTextInputValue('title').trim() || 'Match Settings';
    db.setConfig('stp_' + _u, s);
    return interaction.update(buildSettingsPanel(_u));
  }

  // ── stp_post_<uid>: post to tournament info channel ───────────────────────
  if (id.startsWith('stp_post_')) {
    const tid = parseInt(interaction.values[0]);
    const t   = db.findById('tournaments', tid);
    if (!t?.info_channel) {
      return interaction.reply({ content: '❌ That tournament has no info channel set. Go to `/admin` → Set Channels.', ephemeral: true });
    }
    await interaction.deferUpdate();
    const ch = await interaction.client.channels.fetch(t.info_channel).catch(() => null);
    if (!ch) {
      return interaction.followUp({ content: '❌ Info channel not found or bot has no access.', ephemeral: true });
    }
    await ch.send(buildSettingsPost(uidFrom(id), tid)).catch(() => {});
    await interaction.editReply(buildSettingsPanel(uidFrom(id)));
    return interaction.followUp({ content: `✅ Settings posted to <#${t.info_channel}>.`, ephemeral: true });
  }
}

module.exports = { handleSettingsInteraction };

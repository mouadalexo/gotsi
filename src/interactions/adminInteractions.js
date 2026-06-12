'use strict';
const { buildAdminPanel, buildChannelPickerPanel, buildTestChannelPickerPanel } = require('../panels/adminPanel');
const { db } = require('../utils/database');

async function handleAdminInteraction(interaction) {
  const _origReply = interaction.reply.bind(interaction);
  interaction.reply = async (opts) => {
    const r = await _origReply(opts);
    if (opts && opts.ephemeral) setTimeout(() => interaction.deleteReply().catch(() => {}), 5_000);
    return r;
  };
  const id = interaction.customId;

  if (id === 'adm_refresh' || id === 'adm_done') {
    return interaction.update(buildAdminPanel());
  }

  if (id === 'adm_tch_EL' || id === 'adm_tch_MCL') {
    const template = id.replace('adm_tch_', '');
    return interaction.reply({ ...buildChannelPickerPanel(template), ephemeral: true });
  }

  if (id === 'adm_tch_TEST') {
    return interaction.reply({ ...buildTestChannelPickerPanel(), ephemeral: true });
  }

  // adm_ch_TEST_testpanel — save test channel via config
  if (id === 'adm_ch_TEST_testpanel') {
    const channelId = interaction.values[0] || null;
    db.setConfig('test_channel_id', channelId);
    return interaction.update(buildTestChannelPickerPanel());
  }

  // adm_ch_{TEMPLATE}_{key}  — ChannelSelectMenu saved immediately on change
  if (id.startsWith('adm_ch_')) {
    const parts     = id.split('_');     // ['adm','ch','EL','management']
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

  // adm_setregrole_{TEMPLATE} — open modal to enter a Role ID
  if (id.startsWith('adm_setregrole_') && !id.includes('_modal_')) {
    const template = id.replace('adm_setregrole_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return interaction.reply({ content: `❌ No ${template} tournament found.`, ephemeral: true });

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

  // adm_setregrole_modal_{TEMPLATE} — save registration role from modal
  if (id.startsWith('adm_setregrole_modal_')) {
    const template = id.replace('adm_setregrole_modal_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return interaction.reply({ content: `❌ No ${template} tournament found.`, ephemeral: true });

    const raw    = interaction.fields.getTextInputValue('role_id').trim();
    const roleId = raw.replace(/\D/g, '') || null;
    db.update('tournaments', t.id, { registration_role_id: roleId });

    await interaction.reply({
      content: roleId
        ? `✅ **${template}** registration role set to <@&${roleId}>. Players will receive it on enrollment.`
        : `✅ **${template}** registration role cleared.`,
      ephemeral: true,
    });
    return interaction.update(buildAdminPanel());
  }
}

module.exports = { handleAdminInteraction };

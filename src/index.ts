import { Client, Events, Partials, Status } from "discord.js";
import 'dotenv/config';


import { VoiceConnection, joinVoiceChannel, createAudioPlayer, AudioResource, AudioPlayerStatus, createAudioResource, VoiceConnectionStatus } from "@discordjs/voice";


const player = createAudioPlayer();
const queue: AudioResource[] = [];


player.on("stateChange", (_, newState) => {
    if (newState.status === AudioPlayerStatus.Idle)
        queue.shift();

        if (queue.length >= 1)
            player.play(queue[0]);
});

function enqueue(resource: AudioResource) {
    queue.push(resource);

    if (queue.length == 1)
        player.play(queue[0]);
}



const allowedChannels = new Set<string>();
const allowedUsers = new Set<string>();


let connection: VoiceConnection | null = null;

const DEFAULT_LANGUAGE = "cs";
const userLanguages: Record<string, string> = { }
const userShortcuts: Record<string, Record<string, string>> = { }


const bot = new Client({
    intents: 131071,
    partials: [ Partials.Channel, Partials.GuildMember, Partials.GuildScheduledEvent, Partials.Message, Partials.Reaction, Partials.ThreadMember, Partials.User ]
});

bot.once(Events.ClientReady, () => {
    console.log("Up and running.")
});

bot.on(Events.MessageCreate, async (message) => {
    if (message.channel.isDMBased() && message.author.id == process.env.ADMIN_SNOWFLAKE)
        if ( (await Promise.all(message.content.split(";").map(handleConfigMessage))).some(b => b) )
            return
    
    if ((allowedUsers.has(message.author.id) || allowedUsers.has("any")) && (message.guildId == null || allowedChannels.has(message.channelId) || allowedChannels.has("any")))
        speak(message.content, message.author.id);
});

async function handleConfigMessage(message: string) {

    message = message.trim().toLowerCase();
    const command = message.split(" ", 1)[0];
    const args = message.substring(command.length).trim();

    switch(command) {
        case "user-add":
            args.split(" ").forEach(user => allowedUsers.add(user));
            break;

        case "user-remove":
            args.split(" ").forEach(user => allowedUsers.delete(user));
            break;

        case "channel-add":
            args.split(" ").forEach(channel => allowedChannels.add(channel));
            break;

        case "channel-remove":
            args.split(" ").forEach(channel => allowedChannels.delete(channel));
            break;

        case "connect":
            const channelId = args.split(" ", 1)[0];
            const channel = await bot.channels.fetch(channelId);

            if (connection?.joinConfig.channelId == channel?.id)
                break;

            connection?.disconnect();

            if (channel && channel.isVoiceBased()) {
                connection = joinVoiceChannel({
                    channelId: channelId,
                    guildId: channel.guildId,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                });
                connection.subscribe(player);

                let this_connection = connection;
                connection.on("stateChange", (_, newState) => {
                    if (newState.status == VoiceConnectionStatus.Disconnected && connection == this_connection) {
                        connection.destroy();
                        connection == null;
                    }
                });
            }
            break;

        case "disconnect":
            connection?.disconnect();
            break;

        default:
            return false;

    }

    return true;

}

function speak(message: string, author: string) {

    message = message.trim().toLowerCase();
    const command = message.split(" ", 1)[0];
    const args = message.substring(command.length).trim();

    switch(command) {
        case "lang-set":
            userLanguages[author] = args;
            break;

        case "lang-reset":
            delete userLanguages[author];
            break;

        case "short-add":
            let word = args.split(" ", 1)[0];
            let replacement = args.substring(word.length).trim();
            (userShortcuts[author] = userShortcuts[author] ?? {})[word] = replacement;
            break;

        case "short-remove":
            userShortcuts[author] && delete userShortcuts[author][args];
            break;

        default:
            if (userShortcuts[author]) {
                message = ` ${message} `;

                Object.entries(userShortcuts[author])
                    .forEach(([word, replacement]) => {
                        message = message.replaceAll(` ${word} `, ` ${replacement} `)
                    });

                message = message.substring(1, message.length - 1);
            }

            message
                .split("\n")
                .map(s => s.trim())
                .filter(s => !!s)
                .forEach(s =>
                    enqueue(createAudioResource(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${userLanguages[author] ?? DEFAULT_LANGUAGE}&q=${encodeURIComponent(s)}`))
                );
    }


    
}

bot.login(process.env.DISCORD_TOKEN);



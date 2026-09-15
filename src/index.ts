import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);

// =====================================================
// CONFIG
// =====================================================

// BOT HANYA AKTIF DI GRUP INI
const ALLOWED_CHAT_USERNAME = "LYXERA1";

// TOPIC #beach & pool
const ALLOWED_TOPIC_ID = 170270;

// Folder foto
const ASSETS_DIR = path.join(process.cwd(), "assets");

// =====================================================
// HELPER WAIT
// =====================================================

const WAIT = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// =====================================================
// TYPE
// =====================================================

type Drink = {
  command: string;
  name: string;
  emoji: string;
  description: string;
  ingredients: string;
  image: string;
};

type Order = {
  id: number;
  orderNumber: string;

  chatId: number;
  topicId: number;

  userId: number;
  username: string;
  displayName: string;

  drink: Drink;

  status: "WAITING" | "PROCESSING" | "DONE";
};

// =====================================================
// MENU 10 MINUMAN
// =====================================================

const drinks: Drink[] = [
  {
    command: "vodka",
    name: "Vodka",
    emoji: "🍸",
    description: "Vodka dingin klasik",
    ingredients: "Vodka + Ice",
    image: "vodka.jpg",
  },

  {
    command: "gin",
    name: "Gin",
    emoji: "🍸",
    description: "Gin klasik menyegarkan",
    ingredients: "Gin + Ice",
    image: "gin.jpg",
  },

  {
    command: "rum",
    name: "Rum",
    emoji: "🥃",
    description: "Rum dengan rasa hangat",
    ingredients: "Rum + Ice",
    image: "rum.jpg",
  },

  {
    command: "whisky",
    name: "Whisky",
    emoji: "🥃",
    description: "Whisky klasik",
    ingredients: "Whisky + Ice",
    image: "whiskey.png",
  },

  {
    command: "tequila",
    name: "Tequila",
    emoji: "🍹",
    description: "Tequila segar",
    ingredients: "Tequila + Lime",
    image: "tequila.webp",
  },

  {
    command: "mojito",
    name: "Mojito",
    emoji: "🍹",
    description: "Mojito mint yang menyegarkan",
    ingredients: "Rum + Mint + Lime + Soda",
    image: "mojito.jpg",
  },

  {
    command: "margarita",
    name: "Margarita",
    emoji: "🍸",
    description: "Margarita klasik",
    ingredients: "Tequila + Lime + Triple Sec",
    image: "margarita.jpg",
  },

  {
    command: "gintonic",
    name: "Gin Tonic",
    emoji: "🍸",
    description: "Gin dengan tonic",
    ingredients: "Gin + Tonic + Lime",
    image: "gintonic.jpg",
  },

  {
    command: "oldfashioned",
    name: "Old Fashioned",
    emoji: "🥃",
    description: "Cocktail klasik premium",
    ingredients: "Whisky + Bitters + Sugar",
    image: "oldfashioned.jpg",
  },

  {
    command: "pinacolada",
    name: "Piña Colada",
    emoji: "🍹",
    description: "Minuman tropis creamy",
    ingredients: "Rum + Coconut + Pineapple",
    image: "pinacolada.jpg",
  },
];

// =====================================================
// GLOBAL QUEUE
// =====================================================

const orderQueue: Order[] = [];

let nextOrderId = 1;

let isProcessing = false;

// =====================================================
// NOMOR PESANAN
// RESET SETIAP 00:00 WIB
// =====================================================

let lastResetDate = getTodayDate();

function getTodayDate(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
}

function getNextOrderNumber(): string {
  const today = getTodayDate();

  if (today !== lastResetDate) {
    nextOrderId = 1;
    lastResetDate = today;

    console.log("====================================");
    console.log("🔄 NOMOR PESANAN DI-RESET");
    console.log("📅 Tanggal:", today);
    console.log("🎫 Nomor berikutnya: #001");
    console.log("====================================");
  }

  const number = String(nextOrderId).padStart(3, "0");

  nextOrderId++;

  return number;
}

// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// =====================================================
// USER MENTION
// =====================================================

// Kalau user punya username:
// @username

// Kalau tidak punya username:
// dibuat clickable mention menggunakan Telegram user ID.

function getUserMention(order: Order): string {
  if (order.username) {
    return `@${escapeHtml(order.username)}`;
  }

  return `<a href="tg://user?id=${order.userId}">${escapeHtml(
    order.displayName
  )}</a>`;
}

// =====================================================
// IMAGE PATH
// =====================================================

function getImagePath(image: string): string {
  return path.join(ASSETS_DIR, image);
}

// =====================================================
// CHECK TOPIC
// =====================================================

function isAllowedTopic(ctx: any): boolean {
  if (!ctx.chat) {
    return false;
  }

  // Harus grup / supergroup
  if (
    ctx.chat.type !== "group" &&
    ctx.chat.type !== "supergroup"
  ) {
    return false;
  }

  // Harus grup LYXERA1
  if (
    ctx.chat.username?.toLowerCase() !==
    ALLOWED_CHAT_USERNAME.toLowerCase()
  ) {
    return false;
  }

  // Ambil message_thread_id
  const threadId = ctx.message?.message_thread_id;

  // Harus topic yang ditentukan
  if (threadId !== ALLOWED_TOPIC_ID) {
    return false;
  }

  return true;
}

// =====================================================
// MIDDLEWARE
// BOT HANYA BOLEH DI TOPIC BEACH & POOL
// =====================================================

bot.use(async (ctx, next) => {
  if (!isAllowedTopic(ctx)) {
    return;
  }

  await next();
});

// =====================================================
// MENU
// =====================================================

bot.command("menu", async (ctx) => {
  let message = `
🍸 <b>BAR MENU</b> 🍸

━━━━━━━━━━━━━━━━━━
`;

  drinks.forEach((drink, index) => {
    message += `
${index + 1}. ${drink.emoji} <b>${drink.name}</b>
   ${drink.description}
   🥃 ${drink.ingredients}

   👉 /${drink.command}
`;
  });

  message += `
━━━━━━━━━━━━━━━━━━

🍹 <b>CARA PESAN</b>

Ketik command minuman.

Contoh:

<code>/vodka</code>

Semua pesanan masuk ke
satu antrean bartender.

🎫 Nomor pesanan reset
setiap 00:00 WIB.

📍 Topic:
<b>#beach &amp; pool</b>
`;

  await ctx.reply(message, {
    parse_mode: "HTML",
    message_thread_id: ALLOWED_TOPIC_ID,
  } as any);
});

// =====================================================
// START
// =====================================================

bot.start(async (ctx) => {
  await ctx.reply(
    `
🍸 <b>WELCOME TO THE BAR</b> 🍸

Selamat datang!

Silahkan lihat menu:

👉 /menu

Untuk memesan cukup ketik
command minuman.

Contoh:

<code>/vodka</code>

Semua pesanan akan masuk
ke antrean bartender.

🎫 Nomor reset setiap
00:00 WIB.
`,
    {
      parse_mode: "HTML",
      message_thread_id: ALLOWED_TOPIC_ID,
    } as any
  );
});

// =====================================================
// STATUS
// =====================================================

bot.command("status", async (ctx) => {
  const waiting = orderQueue.filter(
    (order) => order.status === "WAITING"
  ).length;

  const processing = orderQueue.filter(
    (order) => order.status === "PROCESSING"
  ).length;

  const done = orderQueue.filter(
    (order) => order.status === "DONE"
  ).length;

  await ctx.reply(
    `
🍸 <b>STATUS BAR</b>

━━━━━━━━━━━━━━━━━━

⏳ Menunggu   : ${waiting}
🍹 Dibuat     : ${processing}
✅ Selesai    : ${done}

🎫 Nomor berikutnya:
<b>#${String(nextOrderId).padStart(3, "0")}</b>

━━━━━━━━━━━━━━━━━━
`,
    {
      parse_mode: "HTML",
      message_thread_id: ALLOWED_TOPIC_ID,
    } as any
  );
});

// =====================================================
// ANTRIAN
// =====================================================

bot.command("antrian", async (ctx) => {
  const waitingOrders = orderQueue.filter(
    (order) => order.status === "WAITING"
  );

  if (waitingOrders.length === 0) {
    await ctx.reply(
      "🍸 Saat ini tidak ada antrean.",
      {
        message_thread_id: ALLOWED_TOPIC_ID,
      } as any
    );

    return;
  }

  let message = `
📋 <b>ANTRIAN BAR</b>

━━━━━━━━━━━━━━━━━━
`;

  waitingOrders.forEach((order, index) => {
    message += `
${index + 1}. 🎫 <b>#${order.orderNumber}</b>
   ${order.drink.emoji} ${order.drink.name}
   👤 ${getUserMention(order)}
`;
  });

  message += `
━━━━━━━━━━━━━━━━━━
`;

  await ctx.reply(message, {
    parse_mode: "HTML",
    message_thread_id: ALLOWED_TOPIC_ID,
  } as any);
});

// =====================================================
// PROSES QUEUE
// =====================================================

async function processQueue() {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  while (true) {
    const order = orderQueue.find(
      (item) => item.status === "WAITING"
    );

    if (!order) {
      break;
    }

    order.status = "PROCESSING";

    await processOrder(order);
  }

  isProcessing = false;
}

// =====================================================
// PROSES SATU ORDER
// =====================================================

async function processOrder(order: Order) {
  const { drink } = order;

  try {
    // =================================================
    // STEP 1
    // PESANAN MULAI
    // =================================================

    await bot.telegram.sendMessage(
      order.chatId,
      `
🍸 <b>PESANAN #${order.orderNumber}</b>

Baik, pesanan sudah dicatat.

${drink.emoji} <b>${drink.name}</b>

Mohon tunggu sebentar...
`,
      {
        parse_mode: "HTML",
        message_thread_id: order.topicId,
      } as any
    );

    await WAIT(1500);

    // =================================================
    // STEP 2
    // SENYUM
    // =================================================

    await bot.telegram.sendMessage(
      order.chatId,
      `
😊 Bartender tersenyum...

"Baik, saya siapkan pesanannya."
`,
      {
        message_thread_id: order.topicId,
      } as any
    );

    await WAIT(1200);

    // =================================================
    // STEP 3
    // BOW
    // =================================================

    await bot.telegram.sendMessage(
      order.chatId,
      `
🙇 Bartender membungkuk 45°

"Terima kasih."
`,
      {
        message_thread_id: order.topicId,
      } as any
    );

    await WAIT(1200);

    // =================================================
    // STEP 4
    // MENUJU BAR
    // =================================================

    await bot.telegram.sendMessage(
      order.chatId,
      `
🚶 Bartender pergi menuju bar...

🍸 Mulai menyiapkan:

<b>${drink.name}</b>
`,
      {
        parse_mode: "HTML",
        message_thread_id: order.topicId,
      } as any
    );

    await WAIT(1800);

    // =================================================
    // STEP 5
    // FOTO BARTENDER
    // =================================================

    const bartenderImagePath =
      getImagePath("bartender.webp");

    if (fs.existsSync(bartenderImagePath)) {
      await bot.telegram.sendPhoto(
        order.chatId,
        {
          source: bartenderImagePath,
        },
        {
          caption: `
🍸 <b>SEDANG DIBUAT</b>

🎫 Nomor : <b>#${order.orderNumber}</b>
🍹 Pesanan : <b>${drink.name}</b>

👨‍🍳 Bartender sedang meracik
pesanan Anda...

Mohon tunggu sebentar.
`,
          parse_mode: "HTML",
          message_thread_id: order.topicId,
        } as any
      );
    } else {
      await bot.telegram.sendMessage(
        order.chatId,
        `
🍸 <b>SEDANG DIBUAT</b>

🎫 Nomor : <b>#${order.orderNumber}</b>
🍹 Pesanan : <b>${drink.name}</b>

👨‍🍳 Bartender sedang meracik
pesanan Anda...

Mohon tunggu sebentar.
`,
        {
          parse_mode: "HTML",
          message_thread_id: order.topicId,
        } as any
      );
    }

    await WAIT(3000);

    // =================================================
    // STEP 6
    // HAMPIR SELESAI
    // =================================================

    await bot.telegram.sendMessage(
      order.chatId,
      `
🍸 Hampir selesai...

✨ Menambahkan sentuhan terakhir.
`,
      {
        message_thread_id: order.topicId,
      } as any
    );

    await WAIT(2000);

    // =================================================
    // STEP 7
    // ANTAR PESANAN
    // =================================================

    await bot.telegram.sendMessage(
      order.chatId,
      `
🚶 Bartender menaruh pesanan anda di meja bartender...

🍸 <b>${drink.name}</b>
🎫 Nomor <b>#${order.orderNumber}</b>
`,
      {
        parse_mode: "HTML",
        message_thread_id: order.topicId,
      } as any
    );

    await WAIT(1800);

    // =================================================
    // STEP 8
    // FOTO MINUMAN
    // =================================================

    const drinkImagePath =
      getImagePath(drink.image);

    if (fs.existsSync(drinkImagePath)) {
      await bot.telegram.sendPhoto(
        order.chatId,
        {
          source: drinkImagePath,
        },
        {
          caption: `
━━━━━━━━━━━━━━━━━━
🍸 <b>PESANAN SELESAI</b>
━━━━━━━━━━━━━━━━━━

🎫 Nomor : <b>#${order.orderNumber}</b>

${drink.emoji} <b>${drink.name}</b>

✨ Pesanan sudah selesai.

Silahkan dinikmati. 🍹
`,
          parse_mode: "HTML",
          message_thread_id: order.topicId,
        } as any
      );
    } else {
      await bot.telegram.sendMessage(
        order.chatId,
        `
━━━━━━━━━━━━━━━━━━
🍸 <b>PESANAN SELESAI</b>
━━━━━━━━━━━━━━━━━━

🎫 Nomor : <b>#${order.orderNumber}</b>

${drink.emoji} <b>${drink.name}</b>

✨ Pesanan sudah selesai.

Silahkan dinikmati. 🍹
`,
        {
          parse_mode: "HTML",
          message_thread_id: order.topicId,
        } as any
      );
    }

    await WAIT(1000);

    // =================================================
    // STEP 9
    // SENYUM + BOW
    // =================================================

    await bot.telegram.sendMessage(
      order.chatId,
      `
😊 Bartender tersenyum.

🙇 Bartender membungkuk 45°

"Selamat menikmati."
`,
      {
        message_thread_id: order.topicId,
      } as any
    );

    await WAIT(800);

    // =================================================
    // STEP 10
    // TAG USER
    // =================================================

    const mention = getUserMention(order);

    await bot.telegram.sendMessage(
      order.chatId,
      `
📢 <b>Pesanan ${mention} sudah selesai,
harap diambil.</b>

🍸 Pesanan : <b>${drink.name}</b>
🎫 Nomor   : <b>#${order.orderNumber}</b>

━━━━━━━━━━━━━━━━━━
✨ Terima kasih sudah memesan!
━━━━━━━━━━━━━━━━━━
`,
      {
        parse_mode: "HTML",
        message_thread_id: order.topicId,
      } as any
    );

    // =================================================
    // DONE
    // =================================================

    order.status = "DONE";

    console.log(
      `✅ #${order.orderNumber} | ${drink.name} | ${order.displayName} | DONE`
    );
  } catch (error) {
    console.error(
      `❌ Error order #${order.orderNumber}:`,
      error
    );

    order.status = "DONE";
  }
}

// =====================================================
// COMMAND SEMUA MINUMAN
// =====================================================

drinks.forEach((drink) => {
  bot.command(drink.command, async (ctx) => {
    if (!ctx.from || !ctx.chat) {
      return;
    }

    const threadId =
      ctx.message?.message_thread_id;

    // Pastikan command memang diketik
    // di topic yang benar
    if (threadId !== ALLOWED_TOPIC_ID) {
      return;
    }

    const username =
      ctx.from.username || "";

    const displayName =
      [
        ctx.from.first_name,
        ctx.from.last_name,
      ]
        .filter(Boolean)
        .join(" ") ||
      `User ${ctx.from.id}`;

    const orderNumber =
      getNextOrderNumber();

    const order: Order = {
      id: Date.now(),

      orderNumber,

      chatId: ctx.chat.id,

      topicId: threadId,

      userId: ctx.from.id,

      username,

      displayName,

      drink,

      status: "WAITING",
    };

    orderQueue.push(order);

    const queuePosition =
      orderQueue.filter(
        (item) => item.status === "WAITING"
      ).length;

    const mention = getUserMention(order);

    console.log("====================================");
    console.log("📥 ORDER MASUK");
    console.log("🎫 Nomor:", order.orderNumber);
    console.log("🍸 Minuman:", drink.name);
    console.log("👤 User:", displayName);
    console.log("📋 Queue:", queuePosition);
    console.log("====================================");

    await ctx.reply(
      `
🍸 <b>PESANAN DITERIMA</b>

━━━━━━━━━━━━━━━━━━

🎫 Nomor : <b>#${order.orderNumber}</b>
🍹 Minuman : <b>${drink.name}</b>

👤 Pemesan : ${mention}

📋 Posisi antrean : <b>${queuePosition}</b>

━━━━━━━━━━━━━━━━━━

😊 Bartender akan segera
menyiapkan pesanan Anda.

Mohon tunggu...
`,
      {
        parse_mode: "HTML",
        message_thread_id: ALLOWED_TOPIC_ID,
      } as any
    );

    // Jalankan queue
    processQueue();
  });
});

// =====================================================
// DEBUG TOPIC
// =====================================================

// Bisa digunakan kalau ingin mengecek ID topic.
// Hanya aktif di topic yang sudah diizinkan.

bot.command("topicid", async (ctx) => {
  const threadId =
    ctx.message?.message_thread_id;

  await ctx.reply(
    `
🆔 <b>TOPIC INFORMATION</b>

Chat:
<code>${ctx.chat.id}</code>

Topic ID:
<code>${threadId ?? "Tidak ada"}</code>

Configured Topic:
<code>${ALLOWED_TOPIC_ID}</code>
`,
    {
      parse_mode: "HTML",
      message_thread_id: ALLOWED_TOPIC_ID,
    } as any
  );
});

// =====================================================
// ERROR HANDLER
// =====================================================

bot.catch((error) => {
  console.error("====================================");
  console.error("❌ BOT ERROR");
  console.error(error);
  console.error("====================================");
});

// =====================================================
// START BOT
// =====================================================

bot.launch();

console.log("====================================");
console.log("🍸 BARTENDER BOT AKTIF");
console.log("====================================");
console.log("🏠 Group  :", ALLOWED_CHAT_USERNAME);
console.log("📌 Topic  : #beach & pool");
console.log("🆔 Topic  :", ALLOWED_TOPIC_ID);
console.log("🍹 Menu   :", drinks.length, "minuman");
console.log("📋 Queue  : GLOBAL");
console.log("🎫 Reset  : 00:00 WIB");
console.log("====================================");

// =====================================================
// GRACEFUL STOP
// =====================================================

process.once("SIGINT", () => {
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
});
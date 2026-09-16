import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import http from "http";

dotenv.config();

// =====================================================
// CONFIG
// =====================================================

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN belum tersedia di .env");
}

const bot = new Telegraf(BOT_TOKEN);

const ALLOWED_CHAT_ID = -1003895327942;
const ALLOWED_TOPIC_ID = 170270;

const ASSETS_DIR = path.join(
  process.cwd(),
  "assets"
);

const BARTENDER_IMAGE = "bartender.jpg";

// Simulasi waktu bartender
const PREPARING_TIME = 5000;

// =====================================================
// TYPES
// =====================================================

type Drink = {
  command: string;
  name: string;
  emoji: string;
  description: string;
  ingredients: string;
  image: string;
};

type OrderStatus =
  | "WAITING"
  | "PROCESSING"
  | "DONE"
  | "CANCELLED";

type Order = {
  id: number;
  orderNumber: string;

  chatId: number;
  topicId: number;

  userId: number;
  username: string;
  displayName: string;

  drink: Drink;

  status: OrderStatus;

  createdAt: number;
};

// =====================================================
// DRINKS
// =====================================================

const DRINKS: Drink[] = [
  {
    command: "vodka",
    name: "Vodka",
    emoji: "🍸",
    description: "Vodka dengan mixer.",
    ingredients: "Vodka + mixer",
    image: "vodka.jpg",
  },

  {
    command: "gin",
    name: "Gin",
    emoji: "🍸",
    description: "Gin dengan tonic.",
    ingredients: "Gin + tonic",
    image: "gin.jpg",
  },

  {
    command: "rum",
    name: "Rum",
    emoji: "🥃",
    description: "Rum dengan mixer.",
    ingredients: "Rum + mixer",
    image: "rum.jpg",
  },

  {
    command: "whisky",
    name: "Whisky",
    emoji: "🥃",
    description: "Whisky classic.",
    ingredients: "Whisky",
    image: "whisky.jpg",
  },

  {
    command: "tequila",
    name: "Tequila",
    emoji: "🥃",
    description: "Tequila dengan mixer.",
    ingredients: "Tequila + mixer",
    image: "tequila.jpg",
  },

  {
    command: "mojito",
    name: "Mojito",
    emoji: "🍹",
    description: "Mojito fresh.",
    ingredients: "Rum + lime + mint + soda",
    image: "mojito.jpg",
  },

  {
    command: "margarita",
    name: "Margarita",
    emoji: "🍸",
    description: "Margarita fresh.",
    ingredients: "Tequila + lime + orange",
    image: "margarita.jpg",
  },

  {
    command: "gintonic",
    name: "Gin Tonic",
    emoji: "🍸",
    description: "Gin tonic.",
    ingredients: "Gin + tonic",
    image: "gintonic.jpg",
  },

  {
    command: "oldfashioned",
    name: "Old Fashioned",
    emoji: "🥃",
    description: "Classic whisky cocktail.",
    ingredients: "Whisky + bitters + sugar",
    image: "oldfashioned.jpg",
  },

  {
    command: "pinacolada",
    name: "Piña Colada",
    emoji: "🍹",
    description: "Cocktail tropical.",
    ingredients: "Rum + coconut + pineapple",
    image: "pinacolada.jpg",
  },
];

// =====================================================
// STATE
// =====================================================

const orderQueue: Order[] = [];

let nextOrderId = 1;

let isProcessing = false;

let activeQueueMessageId: number | null = null;

let activeQueueChatId: number | null = null;

// =====================================================
// TOPIC FILTER
// =====================================================

function isAllowedTopic(ctx: any): boolean {
  const chat =
    ctx.chat ??
    ctx.callbackQuery?.message?.chat;

  if (!chat) {
    return false;
  }

  if (
    chat.type !== "group" &&
    chat.type !== "supergroup"
  ) {
    return false;
  }

  if (chat.id !== ALLOWED_CHAT_ID) {
    return false;
  }

  const threadId =
    ctx.message?.message_thread_id ??
    ctx.callbackQuery?.message?.message_thread_id;

  if (threadId !== ALLOWED_TOPIC_ID) {
    return false;
  }

  return true;
}

bot.use(async (ctx, next) => {
  if (!isAllowedTopic(ctx)) {
    return;
  }

  await next();
});

// =====================================================
// HELPERS
// =====================================================

function getDrink(
  command: string
): Drink | undefined {
  return DRINKS.find(
    (drink) =>
      drink.command === command
  );
}

function getUsername(ctx: any): string {
  if (ctx.from?.username) {
    return `@${ctx.from.username}`;
  }

  if (ctx.from?.first_name) {
    return ctx.from.first_name;
  }

  return `User${ctx.from?.id ?? ""}`;
}

function getDisplayName(ctx: any): string {
  const first =
    ctx.from?.first_name ?? "";

  const last =
    ctx.from?.last_name ?? "";

  return `${first} ${last}`.trim() || "Unknown";
}

function getWaitingOrders(): Order[] {
  return orderQueue.filter(
    (order) =>
      order.status === "WAITING"
  );
}

function getLatestWaitingOrder():
  | Order
  | undefined {
  const orders =
    getWaitingOrders();

  if (orders.length === 0) {
    return undefined;
  }

  return orders[
    orders.length - 1
  ];
}

function formatOrder(
  order: Order
): string {
  return `#${order.orderNumber} • ${order.drink.emoji} ${order.drink.name}
👤 Atas nama ${order.username}`;
}

// =====================================================
// BUILD QUEUE TEXT
// =====================================================

function buildQueueMessage(): string {
  const orders = getWaitingOrders();

  if (orders.length === 0) {
    return `
📝 <b>PESANAN</b>

Belum ada pesanan.
`;
  }

  const orderList = orders
    .map(
      (order) =>
        `🎫 <b>#${order.orderNumber}</b> • ${order.drink.emoji} ${order.drink.name}
👤 Atas nama ${order.username}`
    )
    .join("\n\n");

  return `
📝 <b>PESANAN</b>

${orderList}
`;
}

// =====================================================
// UNIQUE BUTTON
// =====================================================
//
// Callback LANJUTKAN dibuat berdasarkan:
//
// 1. ID order terakhir
// 2. ID user terakhir
//
// Contoh:
// continue:2:123456789
//
// Jadi hanya user terakhir yang bisa
// menekan LANJUTKAN.
// =====================================================

function getQueueKeyboard() {
  const latest =
    getLatestWaitingOrder();

  if (!latest) {
    return {
      inline_keyboard: [],
    };
  }

  return {
    inline_keyboard: [
      [
        {
          text: "🍸 LANJUTKAN",
          callback_data:
            `continue:${latest.id}:${latest.userId}`,
        },
        {
          text: "❌ TOLAK",
          callback_data:
            "reject_my_order",
        },
      ],
    ],
  };
}

// =====================================================
// CREATE / UPDATE QUEUE CARD
// =====================================================

async function updateQueueCard(
  chatId: number
) {
  const orders = getWaitingOrders();

  if (orders.length === 0) {
    activeQueueMessageId = null;
    activeQueueChatId = null;
    return;
  }

  // ================================================
  // KALAU KARTU SUDAH ADA
  // UPDATE PESANNYA
  // ================================================

  if (
    activeQueueMessageId !== null &&
    activeQueueChatId === chatId
  ) {
    try {
      await bot.telegram.editMessageText(
        chatId,
        activeQueueMessageId,
        undefined,
        buildQueueMessage(),
        {
          parse_mode: "HTML",
          reply_markup:
            getQueueKeyboard(),
        }
      );

      return;
    } catch (error) {
      console.log(
        "Gagal update queue card:",
        error
      );

      activeQueueMessageId = null;
      activeQueueChatId = null;
    }
  }

  // ================================================
  // BUAT PESAN BARU
  // ================================================

  const message =
    await bot.telegram.sendMessage(
      chatId,
      buildQueueMessage(),
      {
        parse_mode: "HTML",

        reply_markup:
          getQueueKeyboard(),

        message_thread_id:
          ALLOWED_TOPIC_ID,
      } as any
    );

  activeQueueMessageId =
    message.message_id;

  activeQueueChatId =
    chatId;

  console.log(
    `✅ Queue card: ${message.message_id}`
  );
}

// =====================================================
// ADD ORDER
// =====================================================

async function addOrder(
  ctx: any,
  drink: Drink
) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  const username = getUsername(ctx);
  const displayName = getDisplayName(ctx);

  // ================================================
  // CEK USER SUDAH PUNYA PESANAN
  // ================================================

  const existingOrder = orderQueue.find(
    (order) =>
      order.userId === userId &&
      order.chatId === chatId &&
      order.topicId === ALLOWED_TOPIC_ID &&
      order.status === "WAITING"
  );

  if (existingOrder) {
    await ctx.reply(
      `
⚠️ <b>KAMU SUDAH MEMESAN</b>

🎫 #${existingOrder.orderNumber} • ${existingOrder.drink.emoji} ${existingOrder.drink.name}
👤 Atas nama ${existingOrder.username}

Silakan tekan ❌ CANCEL terlebih dahulu.
`,
      {
        parse_mode: "HTML",
        message_thread_id: ALLOWED_TOPIC_ID,
      } as any
    );

    return;
  }

  // ================================================
  // BUAT ORDER BARU
  // ================================================

  const order: Order = {
    id: nextOrderId,

    orderNumber: String(nextOrderId).padStart(
      3,
      "0"
    ),

    chatId,

    topicId: ALLOWED_TOPIC_ID,

    userId,

    username,

    displayName,

    drink,

    status: "WAITING",

    createdAt: Date.now(),
  };

  nextOrderId++;

  orderQueue.push(order);

  console.log(
    `🍸 ORDER #${order.orderNumber} - ${username} - ${drink.name}`
  );

  // ================================================
  // INI YANG PENTING
  // ================================================
  //
  // HANYA UPDATE KARTU.
  //
  // JANGAN processBatch() DI SINI.
  //
  // ================================================

  await updateQueueCard(chatId);
}
// =====================================================
// REGISTER DRINK COMMAND
// =====================================================

for (const drink of DRINKS) {
  bot.command(
    drink.command,
    async (ctx) => {
      try {
        await addOrder(
          ctx,
          drink
        );
      } catch (error) {
        console.error(
          `ERROR /${drink.command}:`,
          error
        );
      }
    }
  );
}

// =====================================================
// CALLBACK LANJUTKAN
// =====================================================

bot.action(
  /^continue:(\d+):(\d+)$/,
  async (ctx) => {
    try {
      const callback =
        ctx.callbackQuery;

      if (
        !("data" in callback)
      ) {
        return;
      }

      const parts =
        callback.data.split(":");

      const orderId =
        Number(parts[1]);

      const allowedUserId =
        Number(parts[2]);

      const clickedUserId =
        ctx.from.id;

      // =================================================
      // CEK USER
      // =================================================

      if (
        clickedUserId !==
        allowedUserId
      ) {
        await ctx.answerCbQuery(
          "❌ Hanya orang yang terakhir memesan yang bisa menekan LANJUTKAN.",
          {
            show_alert: true,
          }
        );

        return;
      }

      // =================================================
      // CEK ORDER TERAKHIR
      // =================================================

      const latest =
        getLatestWaitingOrder();

      if (!latest) {
        await ctx.answerCbQuery(
          "Tidak ada pesanan yang menunggu.",
          {
            show_alert: true,
          }
        );

        return;
      }

      if (
        latest.id !== orderId
      ) {
        await ctx.answerCbQuery(
          "❌ Tombol ini sudah tidak aktif.",
          {
            show_alert: true,
          }
        );

        return;
      }

      // =================================================
      // CEK PROCESSING
      // =================================================

      if (isProcessing) {
        await ctx.answerCbQuery(
          "👨‍🍳 Bartender sedang membuat pesanan.",
          {
            show_alert: true,
          }
        );

        return;
      }

      // =================================================
      // AMBIL SEMUA WAITING
      // =================================================

      const batch =
        getWaitingOrders();

      if (batch.length === 0) {
        await ctx.answerCbQuery(
          "Tidak ada pesanan.",
          {
            show_alert: true,
          }
        );

        return;
      }

      await ctx.answerCbQuery(
        "🍸 Pesanan dilanjutkan!"
      );

      // =================================================
      // PROCESS
      // =================================================

      await processBatch(
        batch
      );
    } catch (error) {
      console.error(
        "ERROR CONTINUE:",
        error
      );

      try {
        await ctx.answerCbQuery(
          "❌ Terjadi kesalahan.",
          {
            show_alert: true,
          }
        );
      } catch {}
    }
  }
);

// =====================================================
// CALLBACK TOLAK
// =====================================================

bot.action(
  "reject_my_order",
  async (ctx) => {
    try {
      const userId =
        ctx.from.id;

      const chatId =
        ctx.chat?.id;

      if (!chatId) {
        return;
      }

      // Cari order milik user
      const order =
        orderQueue.find(
          (item) =>
            item.userId ===
              userId &&
            item.chatId ===
              chatId &&
            item.topicId ===
              ALLOWED_TOPIC_ID &&
            item.status ===
              "WAITING"
        );

      if (!order) {
        await ctx.answerCbQuery(
          "❌ Kamu tidak mempunyai pesanan aktif.",
          {
            show_alert: true,
          }
        );

        return;
      }

      // Batalkan
      order.status =
        "CANCELLED";

      await ctx.answerCbQuery(
        `❌ ${order.drink.name} dibatalkan.`
      );

      // Update card
      await updateQueueCard(
        chatId
      );
    } catch (error) {
      console.error(
        "ERROR REJECT:",
        error
      );

      try {
        await ctx.answerCbQuery(
          "❌ Terjadi kesalahan.",
          {
            show_alert: true,
          }
        );
      } catch {}
    }
  }
);

// =====================================================
// PROCESS BATCH
// =====================================================

async function processBatch(
  batchOrders: Order[]
) {
  if (
    batchOrders.length === 0
  ) {
    return;
  }

  isProcessing = true;

  // ===================================================
  // SIMPAN CARD LAMA
  // ===================================================

  const oldMessageId =
    activeQueueMessageId;

  const oldChatId =
    activeQueueChatId;

  // Card lama tidak boleh digunakan lagi
  activeQueueMessageId =
    null;

  activeQueueChatId =
    null;

  // ===================================================
  // UBAH STATUS
  // ===================================================

  for (const order of batchOrders) {
    order.status =
      "PROCESSING";
  }

  // ===================================================
  // PESAN SEDANG DIBUAT
  // ===================================================

  const orderList =
    batchOrders
      .map(
        (order) =>
          `${order.drink.emoji} <b>#${order.orderNumber} ${order.drink.name}</b>\n👤 Atas nama ${order.username}`
      )
      .join("\n\n");

  const chatId =
    oldChatId ??
    ALLOWED_CHAT_ID;

  if (
    oldMessageId !== null
  ) {
    try {
      await bot.telegram.editMessageText(
        chatId,
        oldMessageId,
        undefined,
        `
👨‍🍳 <b>MEMBUAT PESANAN</b>

${orderList}

⏳ Sedang dibuat...
`,
        {
          parse_mode: "HTML",
        }
      );
    } catch (error) {
      console.log(
        "Gagal edit queue card:",
        error
      );
    }
  }

  // ===================================================
  // FOTO BARTENDER
  // ===================================================

  const bartenderPath =
    path.join(
      ASSETS_DIR,
      BARTENDER_IMAGE
    );

  if (
    fs.existsSync(
      bartenderPath
    )
  ) {
    try {
      await bot.telegram.sendPhoto(
        chatId,
        {
          source:
            bartenderPath,
        },
        {
          caption: `
👨‍🍳 <b>MEMBUAT PESANAN</b>

${orderList}

⏳ Sedang dibuat...
`,
          parse_mode: "HTML",

          message_thread_id:
            ALLOWED_TOPIC_ID,
        } as any
      );
    } catch (error) {
      console.error(
        "Gagal mengirim foto bartender:",
        error
      );
    }
  }

  // ===================================================
  // TUNGGU
  // ===================================================

  await new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        PREPARING_TIME
      );
    }
  );

  // ===================================================
  // DONE
  // ===================================================

  for (const order of batchOrders) {
    order.status =
      "DONE";
  }

  // ===================================================
  // PESANAN SELESAI
  // ===================================================

  await bot.telegram.sendMessage(
    chatId,
    `
✅ <b>PESANAN SELESAI</b>

${orderList}

🍸 Semua pesanan sudah selesai.
`,
    {
      parse_mode: "HTML",

      message_thread_id:
        ALLOWED_TOPIC_ID,
    } as any
  );

  // ===================================================
  // DIPANGGIL
  // ===================================================

  await bot.telegram.sendMessage(
    chatId,
    `
📢 <b>SILAKAN DIAMBIL</b>

${orderList}

🔔 Silakan mengambil pesanan kepada bartender.
`,
    {
      parse_mode: "HTML",

      message_thread_id:
        ALLOWED_TOPIC_ID,
    } as any
  );

  // ===================================================
  // SELESAI PROCESSING
  // ===================================================

  isProcessing = false;

  // ===================================================
  // CEK ORDER BARU
  // ===================================================

  const newOrders =
    getWaitingOrders();

  if (
    newOrders.length > 0
  ) {
    await updateQueueCard(
      chatId
    );
  }
}

// =====================================================
// MENU
// =====================================================

bot.command(
  "menu",
  async (ctx) => {
    const menu =
      DRINKS.map(
        (drink) =>
          `${drink.emoji} <b>${drink.name}</b>\n<code>/${drink.command}</code>`
      ).join("\n\n");

    await ctx.reply(
      `
🍸 <b>LYXERA BAR MENU</b>

${menu}

<i>Ketik command minuman untuk memesan.</i>
`,
      {
        parse_mode: "HTML",

        message_thread_id:
          ALLOWED_TOPIC_ID,
      } as any
    );
  }
);

// =====================================================
// START
// =====================================================

bot.command(
  "start",
  async (ctx) => {
    await ctx.reply(
      `
🍸 <b>LYXERA BAR</b>

Selamat datang!

Ketik:
/menu

untuk melihat menu.
`,
      {
        parse_mode: "HTML",

        message_thread_id:
          ALLOWED_TOPIC_ID,
      } as any
    );
  }
);

// =====================================================
// ANTRIAN
// =====================================================

bot.command(
  "antrian",
  async (ctx) => {
    const orders =
      getWaitingOrders();

    if (
      orders.length === 0
    ) {
      await ctx.reply(
        "📝 Tidak ada pesanan.",
        {
          message_thread_id:
            ALLOWED_TOPIC_ID,
        } as any
      );

      return;
    }

    const text =
      orders
        .map(
          formatOrder
        )
        .join("\n\n");

    await ctx.reply(
      `
📝 <b>PESANAN</b>

${text}
`,
      {
        parse_mode: "HTML",

        message_thread_id:
          ALLOWED_TOPIC_ID,
      } as any
    );
  }
);

// =====================================================
// STATUS
// =====================================================

bot.command(
  "status",
  async (ctx) => {
    const waiting =
      orderQueue.filter(
        (x) =>
          x.status ===
          "WAITING"
      ).length;

    const processing =
      orderQueue.filter(
        (x) =>
          x.status ===
          "PROCESSING"
      ).length;

    const done =
      orderQueue.filter(
        (x) =>
          x.status ===
          "DONE"
      ).length;

    const cancelled =
      orderQueue.filter(
        (x) =>
          x.status ===
          "CANCELLED"
      ).length;

    await ctx.reply(
      `
📊 <b>STATUS BAR</b>

⏳ Waiting: ${waiting}
👨‍🍳 Processing: ${processing}
✅ Done: ${done}
❌ Cancelled: ${cancelled}

${
  isProcessing
    ? "👨‍🍳 Bartender sedang bekerja"
    : "🟢 Bartender siap"
}
`,
      {
        parse_mode: "HTML",

        message_thread_id:
          ALLOWED_TOPIC_ID,
      } as any
    );
  }
);

// =====================================================
// DEBUG
// =====================================================

bot.command(
  "debug",
  async (ctx) => {
    await ctx.reply(
      `
🔧 <b>DEBUG</b>

Chat ID:
<code>${ctx.chat.id}</code>

Chat Type:
<code>${ctx.chat.type}</code>

Topic ID:
<code>${
        ctx.message
          ?.message_thread_id ??
        "-"
      }</code>
`,
      {
        parse_mode: "HTML",

        message_thread_id:
          ALLOWED_TOPIC_ID,
      } as any
    );
  }
);

// =====================================================
// ERROR
// =====================================================

bot.catch(
  (error, ctx) => {
    console.error(
      "BOT ERROR:",
      error
    );

    console.error(
      "UPDATE:",
      ctx.updateType
    );
  }
);

// =====================================================
// HEALTH CHECK
// =====================================================

const PORT =
  Number(process.env.PORT) ||
  3000;

const server =
  http.createServer(
    (req, res) => {
      res.writeHead(
        200,
        {
          "Content-Type":
            "text/plain; charset=utf-8",
        }
      );

      res.end(
        "LYXERA BAR BOT is running."
      );
    }
  );

server.on(
  "error",
  (error: any) => {
    if (
      error.code ===
      "EADDRINUSE"
    ) {
      console.error(
        `❌ Port ${PORT} sedang digunakan.`
      );
      return;
    }

    console.error(
      "Server error:",
      error
    );
  }
);

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🌐 Server berjalan di port ${PORT}`
    );
  }
);

// =====================================================
// LAUNCH BOT
// =====================================================

bot.launch().then(() => {
  console.log(
    "🍸 LYXERA BAR BOT ONLINE"
  );

  console.log(
    `Chat ID: ${ALLOWED_CHAT_ID}`
  );

  console.log(
    `Topic ID: ${ALLOWED_TOPIC_ID}`
  );
});

// =====================================================
// SHUTDOWN
// =====================================================

process.once(
  "SIGINT",
  () => {
    bot.stop("SIGINT");
  }
);

process.once(
  "SIGTERM",
  () => {
    bot.stop("SIGTERM");
  }
);
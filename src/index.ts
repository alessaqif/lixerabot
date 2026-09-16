import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import http from "http";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);

// =====================================================
// CONFIG
// =====================================================

const ALLOWED_CHAT_ID = -1003895327942;

const ALLOWED_TOPIC_ID = 170270;

const ASSETS_DIR = path.join(
  process.cwd(),
  "assets"
);

const BARTENDER_IMAGE = "bartender.webp";

// Lama bartender membuat satu minuman
const PREPARING_TIME = 5000;

// =====================================================
// HELPER
// =====================================================

const WAIT = (ms: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

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
// MENU
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
    ingredients:
      "Rum + Mint + Lime + Soda",
    image: "mojito.jpg",
  },

  {
    command: "margarita",
    name: "Margarita",
    emoji: "🍸",
    description: "Margarita klasik",
    ingredients:
      "Tequila + Lime + Triple Sec",
    image: "margarita.jpg",
  },

  {
    command: "gintonic",
    name: "Gin Tonic",
    emoji: "🍸",
    description: "Gin dengan tonic",
    ingredients:
      "Gin + Tonic + Lime",
    image: "gintonic.jpg",
  },

  {
    command: "oldfashioned",
    name: "Old Fashioned",
    emoji: "🥃",
    description:
      "Cocktail klasik premium",
    ingredients:
      "Whisky + Bitters + Sugar",
    image: "oldfashioned.jpg",
  },

  {
    command: "pinacolada",
    name: "Piña Colada",
    emoji: "🍹",
    description:
      "Minuman tropis creamy",
    ingredients:
      "Rum + Coconut + Pineapple",
    image: "pinacolada.jpg",
  },
];

// =====================================================
// QUEUE
// =====================================================

const orderQueue: Order[] = [];

let nextOrderId = 1;

let isProcessing = false;

// =====================================================
// NOMOR PESANAN
// RESET 00:00 WIB
// =====================================================

let lastResetDate = getTodayDate();

function getTodayDate(): string {
  return new Date().toLocaleDateString(
    "en-CA",
    {
      timeZone: "Asia/Jakarta",
    }
  );
}

function getNextOrderNumber(): string {
  const today = getTodayDate();

  if (today !== lastResetDate) {
    nextOrderId = 1;

    lastResetDate = today;

    console.log(
      "===================================="
    );

    console.log(
      "🔄 NOMOR PESANAN DI-RESET"
    );

    console.log(
      "📅 Tanggal:",
      today
    );

    console.log(
      "🎫 Nomor berikutnya: #001"
    );

    console.log(
      "===================================="
    );
  }

  const number =
    String(nextOrderId).padStart(
      3,
      "0"
    );

  nextOrderId++;

  return number;
}

// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(
  text: string
): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

// =====================================================
// USER MENTION
// =====================================================

function getUserMention(
  order: Order
): string {
  if (order.username) {
    return `@${escapeHtml(
      order.username
    )}`;
  }

  return `<a href="tg://user?id=${order.userId}">${escapeHtml(
    order.displayName
  )}</a>`;
}

// =====================================================
// IMAGE
// =====================================================

function getImagePath(
  image: string
): string {
  return path.join(
    ASSETS_DIR,
    image
  );
}

// =====================================================
// CHECK TOPIC
// =====================================================

function isAllowedTopic(
  ctx: any
): boolean {
  if (!ctx.chat) {
    return false;
  }

  if (
    ctx.chat.type !==
      "group" &&
    ctx.chat.type !==
      "supergroup"
  ) {
    return false;
  }

  if (
    ctx.chat.id !==
    ALLOWED_CHAT_ID
  ) {
    return false;
  }

  const threadId =
    ctx.message
      ?.message_thread_id;

  if (
    threadId !==
    ALLOWED_TOPIC_ID
  ) {
    return false;
  }

  return true;
}

// =====================================================
// MIDDLEWARE
// =====================================================

bot.use(
  async (ctx, next) => {
    if (
      !isAllowedTopic(ctx)
    ) {
      return;
    }

    await next();
  }
);

// =====================================================
// BUILD QUEUE MESSAGE
// =====================================================

function buildQueueMessage(): string {
  const activeOrders =
    orderQueue
      .filter(
        (order) =>
          order.status ===
          "WAITING" ||
          order.status ===
          "PROCESSING"
      )
      .sort(
        (a, b) =>
          a.createdAt -
          b.createdAt
      );

  if (
    activeOrders.length ===
    0
  ) {
    return `
📝 <b>PESANAN</b>

Tidak ada pesanan.
`;
  }

  let message = `
📝 <b>PESANAN</b>

`;

  activeOrders.forEach(
    (order) => {
      message += `
🎫 <b>#${order.orderNumber}</b> • ${order.drink.emoji} ${escapeHtml(
        order.drink.name
      )}
👤 Atas nama ${getUserMention(
        order
      )}
`;

      if (
        order.status ===
        "PROCESSING"
      ) {
        message +=
          "👨‍🍳 <i>Sedang dibuat...</i>\n";
      }

      message += "\n";
    }
  );

  return message;
}

// =====================================================
// MENU
// =====================================================

bot.command(
  "menu",
  async (ctx) => {
    let message = `
🍸 <b>BAR MENU</b>

━━━━━━━━━━━━━━━━━━
`;

    drinks.forEach(
      (drink, index) => {
        message += `
${index + 1}. ${drink.emoji} <b>${drink.name}</b>
   ${drink.description}
   🥃 ${drink.ingredients}

   👉 /${drink.command}
`;
      }
    );

    message += `
━━━━━━━━━━━━━━━━━━

📝 <b>CARA PESAN</b>

Ketik command minuman.

Contoh:

<code>/vodka</code>

Pesanan akan masuk ke
antrean sesuai urutan.

🎫 Nomor reset setiap
00:00 WIB.
`;

    await ctx.reply(
      message,
      {
        parse_mode:
          "HTML",

        message_thread_id:
          ALLOWED_TOPIC_ID,
      } as any
    );
  }
);

// =====================================================
// START
// =====================================================

bot.start(
  async (ctx) => {
    await ctx.reply(
      `
🍸 <b>WELCOME TO LYXERA BAR</b>

Silakan lihat menu:

👉 /menu

Contoh pesan:

<code>/vodka</code>
<code>/gin</code>
<code>/rum</code>

Pesanan akan masuk ke antrean.
`,
      {
        parse_mode:
          "HTML",

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
        (order) =>
          order.status ===
          "WAITING"
      ).length;

    const processing =
      orderQueue.filter(
        (order) =>
          order.status ===
          "PROCESSING"
      ).length;

    const done =
      orderQueue.filter(
        (order) =>
          order.status ===
          "DONE"
      ).length;

    await ctx.reply(
      `
🍸 <b>STATUS BAR</b>

━━━━━━━━━━━━━━━━━━

⏳ Menunggu   : ${waiting}
👨‍🍳 Dibuat     : ${processing}
✅ Selesai    : ${done}

🎫 Berikutnya:
<b>#${String(
        nextOrderId
      ).padStart(
        3,
        "0"
      )}</b>

━━━━━━━━━━━━━━━━━━
`,
      {
        parse_mode:
          "HTML",

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
    await ctx.reply(
      buildQueueMessage(),
      {
        parse_mode:
          "HTML",

        message_thread_id:
          ALLOWED_TOPIC_ID,
      } as any
    );
  }
);

// =====================================================
// PROSES PESANAN SATU PER SATU
// =====================================================

async function processNextOrder() {
  if (
    isProcessing
  ) {
    return;
  }

  const nextOrder =
    orderQueue
      .filter(
        (order) =>
          order.status ===
          "WAITING"
      )
      .sort(
        (a, b) =>
          a.createdAt -
          b.createdAt
      )[0];

  if (!nextOrder) {
    return;
  }

  isProcessing = true;

  nextOrder.status =
    "PROCESSING";

  console.log(
    "===================================="
  );

  console.log(
    "👨‍🍳 MULAI MEMBUAT"
  );

  console.log(
    "🎫 #",
    nextOrder.orderNumber
  );

  console.log(
    "🍸",
    nextOrder.drink.name
  );

  console.log(
    "👤",
    nextOrder.displayName
  );

  console.log(
    "===================================="
  );

  try {
    // =================================================
    // PESANAN SEDANG DIBUAT
    // =================================================

    const preparingText = `
👨‍🍳 <b>MEMBUAT PESANAN</b>

🎫 <b>#${nextOrder.orderNumber}</b>
${nextOrder.drink.emoji} <b>${escapeHtml(
      nextOrder.drink.name
    )}</b>

👤 Atas nama ${getUserMention(
      nextOrder
    )}

⏳ Sedang dibuat...
`;

    const imagePath =
      getImagePath(
        BARTENDER_IMAGE
      );

    if (
      fs.existsSync(
        imagePath
      )
    ) {
      await bot.telegram.sendPhoto(
        nextOrder.chatId,
        {
          source: imagePath,
        },
        {
          caption:
            preparingText,
          parse_mode:
            "HTML",

          message_thread_id:
            nextOrder.topicId,
        } as any
      );
    } else {
      await bot.telegram.sendMessage(
        nextOrder.chatId,
        preparingText,
        {
          parse_mode:
            "HTML",

          message_thread_id:
            nextOrder.topicId,
        } as any
      );
    }

    // =================================================
    // TUNGGU
    // =================================================

    await WAIT(
      PREPARING_TIME
    );

    // =================================================
    // SELESAI
    // =================================================

    nextOrder.status =
      "DONE";

    await bot.telegram.sendMessage(
      nextOrder.chatId,
      `
✅ <b>PESANAN SELESAI</b>

🎫 <b>#${nextOrder.orderNumber}</b>
${nextOrder.drink.emoji} <b>${escapeHtml(
        nextOrder.drink.name
      )}</b>

👤 Atas nama ${getUserMention(
        nextOrder
      )}

📢 Silakan mengambil pesanan.
`,
      {
        parse_mode:
          "HTML",

        message_thread_id:
          nextOrder.topicId,
      } as any
    );

    console.log(
      `✅ #${nextOrder.orderNumber} | ${nextOrder.drink.name} | ${nextOrder.displayName} | DONE`
    );

    // =================================================
    // CEK PESANAN BERIKUTNYA
    // =================================================

    const remainingOrders =
      orderQueue
        .filter(
          (order) =>
            order.status ===
            "WAITING"
        )
        .sort(
          (a, b) =>
            a.createdAt -
            b.createdAt
        );

    if (
      remainingOrders.length >
      0
    ) {
      await WAIT(500);

      await bot.telegram.sendMessage(
        nextOrder.chatId,
        `
🍸 <b>PESANAN BERIKUTNYA</b>

${buildQueueMessage()}
`,
        {
          parse_mode:
            "HTML",

          message_thread_id:
            nextOrder.topicId,
        } as any
      );
    }
  } catch (error) {
    console.error(
      "❌ Error membuat pesanan:",
      error
    );

    nextOrder.status =
      "WAITING";
  } finally {
    isProcessing =
      false;

    // =================================================
    // JIKA ADA PESANAN LAIN,
    // OTOMATIS PROSES BERIKUTNYA
    // =================================================

    const remaining =
      orderQueue.filter(
        (order) =>
          order.status ===
          "WAITING"
      );

    if (
      remaining.length >
      0
    ) {
      setTimeout(() => {
        processNextOrder();
      }, 1000);
    }
  }
}

// =====================================================
// COMMAND SEMUA MINUMAN
// =====================================================

drinks.forEach(
  (drink) => {
    bot.command(
      drink.command,
      async (ctx) => {
        if (
          !ctx.from ||
          !ctx.chat
        ) {
          return;
        }

        const threadId =
          ctx.message
            ?.message_thread_id;

        if (
          threadId !==
          ALLOWED_TOPIC_ID
        ) {
          return;
        }

        const username =
          ctx.from.username ||
          "";

        const displayName =
          [
            ctx.from.first_name,
            ctx.from.last_name,
          ]
            .filter(Boolean)
            .join(" ") ||
          `User ${ctx.from.id}`;

        // =================================================
        // BUAT ORDER NUMBER
        // =================================================

        const orderNumber =
          getNextOrderNumber();

        // =================================================
        // BUAT ORDER
        // =================================================

        const order: Order = {
          id:
            Date.now() +
            Math.floor(
              Math.random() *
                1000
            ),

          orderNumber,

          chatId:
            ctx.chat.id,

          topicId:
            threadId,

          userId:
            ctx.from.id,

          username,

          displayName,

          drink,

          status:
            "WAITING",

          createdAt:
            Date.now(),
        };

        // =================================================
        // MASUK QUEUE
        // =================================================

        orderQueue.push(
          order
        );

        console.log(
          "===================================="
        );

        console.log(
          "📥 PESANAN MASUK"
        );

        console.log(
          "🎫 #",
          order.orderNumber
        );

        console.log(
          "🍸",
          drink.name
        );

        console.log(
          "👤",
          displayName
        );

        console.log(
          "===================================="
        );

        // =================================================
        // TAMPILKAN PESANAN
        // =================================================

        await ctx.reply(
          buildQueueMessage(),
          {
            parse_mode:
              "HTML",

            message_thread_id:
              ALLOWED_TOPIC_ID,
          } as any
        );

        // =================================================
        // MULAI PROSES
        // =================================================

        if (
          !isProcessing
        ) {
          processNextOrder();
        }
      }
    );
  }
);

// =====================================================
// TOPIC ID
// =====================================================

bot.command(
  "topicid",
  async (ctx) => {
    const threadId =
      ctx.message
        ?.message_thread_id;

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
        parse_mode:
          "HTML",

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

Chat:
<code>${ctx.chat.id}</code>

Username:
<code>${ctx.chat.username ?? "-"}</code>

Topic:
<code>${
        ctx.message
          ?.message_thread_id ??
        "-"
      }</code>
`,
      {
        parse_mode:
          "HTML",

        message_thread_id:
          ALLOWED_TOPIC_ID,
      } as any
    );
  }
);

// =====================================================
// ERROR HANDLER
// =====================================================

bot.catch((error) => {
  console.error(
    "===================================="
  );

  console.error(
    "❌ BOT ERROR"
  );

  console.error(error);

  console.error(
    "===================================="
  );
});

// =====================================================
// HTTP SERVER
// UNTUK HOSTING
// =====================================================

const PORT =
  process.env.PORT || 3000;

http
  .createServer(
    (req, res) => {
      if (
        req.url ===
        "/health"
      ) {
        res.writeHead(200, {
          "Content-Type":
            "text/plain",
        });

        res.end(
          "🍸 Bartender Bot is alive"
        );

        return;
      }

      res.writeHead(200, {
        "Content-Type":
          "text/plain",
      });

      res.end(
        "🍸 LYXERA BAR BOT"
      );
    }
  )
  .listen(PORT, () => {
    console.log(
      `🌐 HTTP server running on port ${PORT}`
    );
  });

// =====================================================
// START BOT
// =====================================================

bot.launch();

console.log(
  "===================================="
);

console.log(
  "🍸 LYXERA BAR BOT AKTIF"
);

console.log(
  "===================================="
);

console.log(
  "🏠 Chat ID :",
  ALLOWED_CHAT_ID
);

console.log(
  "📌 Topic  : #beach & pool"
);

console.log(
  "🆔 Topic  :",
  ALLOWED_TOPIC_ID
);

console.log(
  "🍹 Menu   :",
  drinks.length,
  "minuman"
);

console.log(
  "📋 Queue  : ONE BY ONE"
);

console.log(
  "🎫 Reset  : 00:00 WIB"
);

console.log(
  "📸 Bartender photo : ENABLED"
);

console.log(
  "===================================="
);

// =====================================================
// GRACEFUL STOP
// =====================================================

process.once(
  "SIGINT",
  () => {
    bot.stop(
      "SIGINT"
    );
  }
);

process.once(
  "SIGTERM",
  () => {
    bot.stop(
      "SIGTERM"
    );
  }
);
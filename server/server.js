require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");

const connectDB = require("./config/db");
const User = require("./models/User");
const StudyData = require("./models/StudyData");

const authRoutes = require("./routes/authRoutes");
const dataRoutes = require("./routes/dataRoutes");
const userRoutes = require("./routes/userRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");
const otpRoutes = require("./routes/otpRoutes");
const passwordResetRoutes = require("./routes/passwordResetRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// --------------------------------------------------
// CORS CONFIGURATION
// --------------------------------------------------

// Exact origins: your production Vercel URL (CLIENT_URL on Render) + local dev.
// CLIENT_URL must be a bare origin, e.g. https://your-app.vercel.app (no trailing slash).
const allowedOrigins = new Set(
  [
    (process.env.CLIENT_URL || "").replace(/\/$/, ""),
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ].filter(Boolean)
);

// Vercel preview deployments for this project, e.g.
// https://aistudyhub-q07yhcdf8-virajdesai6211-2158.vercel.app
const vercelPreviewPattern =
  /^https:\/\/aistudyhub[a-z0-9-]*-virajdesai6211-2158\.vercel\.app$/;

const localDevPattern = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: server-to-server calls, curl, Postman, health checks.
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.has(origin) ||
        localDevPattern.test(origin) ||
        vercelPreviewPattern.test(origin)
      ) {
        return callback(null, true);
      }

      // Reject cleanly (no CORS headers) instead of throwing an error.
      console.warn(`CORS blocked origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// --------------------------------------------------
// STATIC FILES
// --------------------------------------------------

// Make uploaded images accessible from /uploads/<filename>
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --------------------------------------------------
// REQUEST BODY PARSING
// --------------------------------------------------

// IMPORTANT:
// Do not parse multipart/form-data as JSON.
// Multer in uploadRoutes.js must receive the original request.
app.use((req, res, next) => {
  if (req.is("multipart/form-data")) {
    return next();
  }

  return express.json({ limit: "10mb" })(req, res, next);
});

// --------------------------------------------------
// API ROOT AND HEALTH CHECK
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    message: "AI StudyHub API is running",
    database: "MongoDB Atlas",
  });
});

app.get("/api/health/db", (req, res) => {
  const mongoose = require("mongoose");
  const state = mongoose.connection.readyState;

  res.json({
    connected: state === 1,
    state,
    database: mongoose.connection.name || null,
  });
});

// --------------------------------------------------
// API ROUTES
// --------------------------------------------------

app.use("/api/ai", require("./routes/aiRoutes"));

// Upload route uses Multer to process multipart/form-data.
app.use("/api/uploads", uploadRoutes);

// More specific /api/auth/* routes first, then the general auth routes.
app.use("/api/auth/otp", otpRoutes);
app.use("/api/auth/password-reset", passwordResetRoutes);
app.use("/api/auth", authRoutes);

app.use("/api/data", dataRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/chatbot", chatbotRoutes);

// --------------------------------------------------
// SEED DEMO USERS
// --------------------------------------------------

async function seedDemoUsers() {
  const demos = [
    {
      name: "Admin",
      email: "admin@studyhub.com",
      password: "admin123",
      role: "admin",
    },
    {
      name: "Demo Teacher",
      email: "teacher@studyhub.com",
      password: "teacher123",
      role: "teacher",
    },
    {
      name: "Demo Student",
      email: "student@studyhub.com",
      password: "student123",
      role: "student",
    },
  ];

  for (const demo of demos) {
    const exists = await User.findOne({ email: demo.email });

    if (!exists) {
      const password = await bcrypt.hash(demo.password, 12);

      await User.create({
        ...demo,
        password,
        status: "active",
      });

      console.log(`Created demo account: ${demo.email}`);
    }
  }
}

// --------------------------------------------------
// SEED DEFAULT STUDY DATA
// --------------------------------------------------

async function seedStudyData() {
  const teacherEmail = "teacher@studyhub.com";
  const teacherName = "Demo Teacher";
  const date = new Date().toLocaleDateString("en-IN");

  const catalog = [
    {
      id: 1,
      title: "Database Management",
      subtitle: "Normalization & SQL",
      category: "DBMS",
      description: "Relational design, normal forms and SQL queries.",
      status: "approved",
      teacherEmail,
      teacherName,
    },
    {
      id: 2,
      title: "React Development",
      subtitle: "Components & Hooks",
      category: "React",
      description: "Build interactive interfaces with React.",
      status: "approved",
      teacherEmail,
      teacherName,
    },
    {
      id: 3,
      title: "Java Programming",
      subtitle: "OOP Concepts",
      category: "Java",
      description: "Classes, inheritance and polymorphism in Java.",
      status: "approved",
      teacherEmail,
      teacherName,
    },
    {
      id: 4,
      title: "Machine Learning",
      subtitle: "Feature Engineering",
      category: "ML",
      description: "Supervised learning and model evaluation basics.",
      status: "approved",
      teacherEmail,
      teacherName,
    },
  ];

  const enrollments = [
    { id: 1, email: "student@studyhub.com", courseId: 1, progress: 68 },
    { id: 2, email: "student@studyhub.com", courseId: 2, progress: 42 },
    { id: 3, email: "student@studyhub.com", courseId: 3, progress: 81 },
    { id: 4, email: "student@studyhub.com", courseId: 4, progress: 35 },
  ];

  const library = [
    {
      id: 1,
      name: "DBMS Normalization Notes",
      type: "PDF",
      size: "1.8 MB",
      scope: "course",
      courseId: 1,
      uploaderEmail: teacherEmail,
      uploaderName: teacherName,
      date,
    },
    {
      id: 2,
      name: "React Hooks Cheat Sheet",
      type: "DOC",
      size: "420 KB",
      scope: "course",
      courseId: 2,
      uploaderEmail: teacherEmail,
      uploaderName: teacherName,
      date,
    },
    {
      id: 3,
      name: "Java OOP Revision",
      type: "PDF",
      size: "2.1 MB",
      scope: "course",
      courseId: 3,
      uploaderEmail: teacherEmail,
      uploaderName: teacherName,
      date,
    },
  ];

  const quizzes = [
    {
      id: 1,
      title: "DBMS Basics Check",
      courseId: 1,
      teacherEmail,
      questions: [
        {
          q: "Which normal form removes repeating groups and requires atomic values?",
          options: ["1NF", "2NF", "3NF", "BCNF"],
          answer: 0,
        },
        {
          q: "What does a primary key guarantee?",
          options: [
            "Unique, non-null row identity",
            "Faster inserts",
            "Encrypted data",
            "Duplicate rows",
          ],
          answer: 0,
        },
      ],
    },
  ];

  const global = [
    ["catalog", catalog],
    ["enrollments", enrollments],
    ["library", library],
    ["quizzes", quizzes],
    ["system", { allowRegistration: true, requireApproval: true }],
  ];

  for (const [resource, data] of global) {
    const exists = await StudyData.exists({ resource, ownerEmail: null });

    if (!exists) {
      await StudyData.create({ resource, ownerEmail: null, data });
    }
  }

  const studentDefaults = [
    [
      "tasks",
      [
        { id: 1, text: "Review DBMS normalization", done: true },
        { id: 2, text: "Complete React hooks lesson", done: false },
        { id: 3, text: "Take today's practice quiz", done: false },
        { id: 4, text: "Review 10 flashcards", done: false },
      ],
    ],
    ["chat", []],
    ["quizHistory", []],
    [
      "flashcards",
      [
        {
          id: 1,
          question: "What is 1NF?",
          answer: "A relation with atomic values and no repeating groups.",
        },
        {
          id: 2,
          question: "What is a React Hook?",
          answer:
            "A function that lets React components use state and other features.",
        },
      ],
    ],
    [
      "planner",
      [
        {
          id: 1,
          time: "10:00",
          title: "DBMS normalization",
          duration: "45 min",
          done: false,
        },
        {
          id: 2,
          time: "15:00",
          title: "React Hooks revision",
          duration: "60 min",
          done: true,
        },
        {
          id: 3,
          time: "19:00",
          title: "Practice quiz",
          duration: "30 min",
          done: false,
        },
      ],
    ],
    ["settings", { notifications: true, compactMode: false }],
  ];

  const studentExists = await User.exists({ email: "student@studyhub.com" });

  if (studentExists) {
    for (const [resource, data] of studentDefaults) {
      const exists = await StudyData.exists({
        resource,
        ownerEmail: "student@studyhub.com",
      });

      if (!exists) {
        await StudyData.create({
          resource,
          ownerEmail: "student@studyhub.com",
          data,
        });
      }
    }
  }
}

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

async function start() {
  try {
    await connectDB();

    await seedDemoUsers();
    await seedStudyData();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup aborted:", error.message);

    process.exit(1);
  }
}

start();
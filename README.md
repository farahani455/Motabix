# Motabix - AI Assistant for VS Code

## معرفی پروژه

**Motabix** یک افزونه پیشرفته Visual Studio Code است که یک دستیار هوش مصنوعی کامل و بومی‌سازی شده ارائه می‌دهد.

## قابلیت‌های اصلی

### دو حالت Agent هوشمند

**Ask Mode** - چت ساده با Streaming:
- پاسخ به سوالات برنامه‌نویسی
- توضیح کدها و مفاهیم
- دیباگ و رفع مشکلات
- پشتیبانی از Streaming برای پاسخ‌های سریع‌تر

**Editor Mode** - تولید و ویرایش کد:
- تولید کد کامل و آماده استفاده
- ویرایش مستقیم فایل‌های فعال
- نمایش تغییرات با سیستم Diff پیشرفته
- ایجاد فایل‌های جدید با نام پیشنهادی هوشمند

### سیستم Diff پیشرفته
- نمایش تغییرات با رنگ‌های مختلف (سبز/قرمز/نارنجی)
- نادیده گرفتن whitespace و کامنت‌ها
- نمایش در Overview Ruler

### مدیریت تاریخچه
- Chat History: ذخیره مکالمات در workspaceState
- Code History: Undo/Redo تغییرات کد

### بومی‌سازی کامل
- تشخیص خودکار زبان (فارسی/انگلیسی)
- پاسخ به زبان سوال کاربر

### مدل‌های پشتیبانی شده
- GPT-4o (پیش‌فرض)
- GPT-4o-mini
- GPT-4-turbo
- Gemini 2.5 Pro

## معماری پروژه

```
src/
├── extension.ts          # Entry point - سیم‌کشی همه چیز
├── commands/             # دستورات VS Code
│   └── openInRightSidebar.ts
├── handlers/             # مدیریت پیام‌ها و رویدادها
│   ├── MessageHandler.ts         # Router اصلی
│   ├── SendMessageCommand.ts     # ارسال پیام به AI
│   ├── ChangeManagementCommands.ts # Accept/Reject تغییرات
│   ├── CopyHandlerService.ts     # کپی کد
│   ├── InsertCodeHandlerService.ts # Insert کد
│   ├── BrowseContentService.ts   # مرور فایل‌ها
│   ├── ActiveDocumentManager.ts  # مدیریت فایل فعال
│   └── StreamBuffer.ts           # بافر Streaming
├── services/             # Business Logic
│   ├── ChatService.ts            # ارتباط با OpenAI API
│   ├── DiffService.ts            # محاسبه و نمایش تغییرات
│   ├── ChatHistoryService.ts     # مدیریت تاریخچه چت
│   ├── CodeHistoryService.ts     # مدیریت تاریخچه کد
│   ├── ChangeManagementService.ts # Accept/Reject منطق
│   ├── EditorService.ts          # عملیات روی Editor
│   ├── SessionConfigService.ts   # تنظیمات Session
│   ├── ConfigService.ts          # تنظیمات VS Code
│   ├── NotifHandlerService.ts    # نمایش اعلان‌ها
│   └── OpenAIClientFactory.ts    # ساخت OpenAI Client
├── views/                # UI و Rendering
│   ├── MotabixViewProvider.ts    # WebviewViewProvider اصلی
│   ├── MessageRouter.ts          # Route پیام‌های Webview
│   ├── RenderChatHistory.ts      # رندر تاریخچه چت
│   ├── RenderSessionConfig.ts    # رندر تنظیمات
│   └── SessionConfigRouter.ts    # Route تنظیمات Session
├── types/                # TypeScript Types
│   ├── chat.ts                   # ChatMessage, ChatSession
│   ├── response-format-type.ts   # ResponseFormat
│   └── StreamBufferResponse.ts   # Stream types
└── utils/                # Helper Functions
    ├── getSystemPrompt.ts        # System Prompt برای هر Agent
    ├── parseAIResponse.ts        # Parse JSON از AI
    ├── languageTools.ts          # تشخیص زبان
    ├── fileUtilities.ts          # کار با فایل‌ها
    ├── formatResponse.ts         # فرمت‌بندی پاسخ
    ├── getInsertionMode.ts       # حالت Insert
    ├── isLargeEdit.ts            # تشخیص ویرایش بزرگ
    └── shouldStream.ts           # تصمیم Streaming
```

## جریان کار (Flow)

### حالت Ask:
1. کاربر پیام می‌نویسد
2. Webview پیام را به Extension ارسال می‌کند
3. SendMessageCommand پیام را پردازش می‌کند
4. ChatService.sendMessageStream فراخوانی می‌شود
5. هر chunk از AI به Webview ارسال می‌شود (Streaming)
6. پیام در ChatHistory ذخیره می‌شود

### حالت Editor:
1. کاربر درخواست کد می‌دهد
2. AI پاسخ JSON برمی‌گرداند
3. parseAIResponse پاسخ را parse می‌کند
4. EditorService کد را در فایل فعال Insert می‌کند
5. DiffService تغییرات را Highlight می‌کند
6. کاربر Accept یا Reject می‌کند


## نحوه اجرا

```bash
# نصب dependencies
npm install

# کامپایل TypeScript
npm run compile

# Watch mode (کامپایل خودکار)
npm run watch

# اجرا در VS Code
# F5 را فشار دهید
```

## تنظیمات

در VS Code Settings:
- `motabix.apiKey`: کلید API OpenAI
- `motabix.model`: مدل AI (پیش‌فرض: gpt-4o)
- `motabix.baseURL`: آدرس API (پیش‌فرض: https://api.openai.com/v1)

## وابستگی‌ها

```json
{
  dependencies: {
    openai: ^6.33.0,
    diff: ^9.0.0,
    @vscode/codicons: ^0.0.45
  }
}
```

## لایسنس

مشاهده فایل LICENSE.txt

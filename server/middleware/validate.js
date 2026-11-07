const { body, param, query, validationResult } = require('express-validator');

// Общая функция для проверки ошибок
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Ошибка валидации',
                code: 'VALIDATION_ERROR',
                details: errors.array()
            }
        });
    }
    next();
};

// ===== ВАЛИДАЦИЯ РЕГИСТРАЦИИ (расширенная) =====
exports.validateRegistration = [
    body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Имя должно быть от 3 до 50 символов'),
    body('email').isEmail().withMessage('Некорректный email').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Пароль должен быть минимум 6 символов'),
    body('phone').optional().trim().escape(),
    body('acceptTerms').isBoolean().withMessage('Необходимо принять условия'),
    body('city_id').optional().isInt().withMessage('ID города должен быть числом'),
    body('hcaptchaToken').optional().isString().withMessage('Токен капчи должен быть строкой'),
    body('security_question').trim().isLength({ min: 1 }).withMessage('Выберите контрольный вопрос'),
    body('security_answer').trim().isLength({ min: 3 }).withMessage('Ответ должен быть минимум 3 символа'),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ ВХОДА =====
exports.validateLogin = [
    body('username').notEmpty().withMessage('Имя пользователя обязательно'),
    body('password').notEmpty().withMessage('Пароль обязателен'),
    body('hcaptchaToken').optional().isString().withMessage('Токен капчи должен быть строкой'),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ ИЗМЕНЕНИЯ ПАРОЛЯ =====
exports.validateChangePassword = [
    body('oldPassword').notEmpty().withMessage('Старый пароль обязателен'),
    body('newPassword').isLength({ min: 6 }).withMessage('Новый пароль должен быть минимум 6 символов'),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ ВОССТАНОВЛЕНИЯ (запрос вопроса) =====
exports.validateForgotPassword = [
    body('identifier').notEmpty().withMessage('Введите имя пользователя или email'),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ СБРОСА ПАРОЛЯ =====
exports.validateResetPassword = [
    body('resetToken').notEmpty().withMessage('Токен обязателен'),
    body('security_answer').notEmpty().withMessage('Ответ на контрольный вопрос обязателен'),
    body('newPassword').isLength({ min: 6 }).withMessage('Пароль должен быть минимум 6 символов'),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ СМЕНЫ ИМЕНИ =====
exports.validateUsername = [
    body('newUsername').trim().isLength({ min: 3, max: 50 }).withMessage('Имя должно быть от 3 до 50 символов'),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ ОБНОВЛЕНИЯ ПРОФИЛЯ =====
exports.validateProfileUpdate = [
    body('username').optional().trim().escape(),
    body('email').optional().isEmail().withMessage('Некорректный email').normalizeEmail(),
    body('phone').optional().trim().escape(),
    body('city_id').optional().isInt().withMessage('ID города должен быть числом'),
    body('whatsapp').optional().trim().escape(),
    body('telegram').optional().trim().escape(),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ СОЗДАНИЯ ОБЪЯВЛЕНИЯ =====
exports.validateListing = [
    body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Заголовок от 3 до 200 символов'),
    body('description').trim().isLength({ min: 10 }).withMessage('Описание минимум 10 символов'),
    body('price').optional().isNumeric().withMessage('Цена должна быть числом'),
    body('category_id').optional().isInt().withMessage('Категория должна быть числом'),
    body('city_id').optional().isInt().withMessage('Город должен быть числом'),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ СООБЩЕНИЙ В ЧАТЕ =====
exports.validateMessage = [
    body('text').trim().isLength({ min: 1, max: 5000 }).withMessage('Сообщение от 1 до 5000 символов'),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ ID В ПАРАМЕТРАХ =====
exports.validateIdParam = [
    param('id').isInt().withMessage('ID должен быть числом'),
    handleValidationErrors
];

// ===== ВАЛИДАЦИЯ QUERY-ПАРАМЕТРОВ ДЛЯ СПИСКОВ =====
exports.validateListingsQuery = [
    query('page').optional().isInt({ min: 1 }).withMessage('Страница должна быть положительным числом'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Лимит должен быть от 1 до 100'),
    query('city_id').optional().isInt().withMessage('ID города должен быть числом'),
    query('category_id').optional().isInt().withMessage('ID категории должен быть числом'),
    query('type').optional().isIn(['sell', 'rent']).withMessage('Тип должен быть sell или rent'),
    query('min_price').optional().isNumeric().withMessage('Минимальная цена должна быть числом'),
    query('max_price').optional().isNumeric().withMessage('Максимальная цена должна быть числом'),
    handleValidationErrors
];
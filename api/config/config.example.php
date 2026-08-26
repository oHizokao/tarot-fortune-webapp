<?php

declare(strict_types=1);

/*
 * Copy this file to config.php or config.local.php on Hostinger.
 * Prefer environment variables where your hosting plan supports them.
 * Never commit a file containing a real OpenAI key.
 */
return [
    'app' => [
        'timezone' => 'Asia/Bangkok',
        'log_ai_content' => false,
        'cards_file' => dirname(__DIR__, 2) . '/data/cards.json',
    ],
    'db' => [
        'dsn' => getenv('TAROT_DB_DSN') ?: 'mysql:host=localhost;dbname=tarot_fortune;charset=utf8mb4',
        'username' => getenv('TAROT_DB_USER') ?: 'tarot_user',
        'password' => getenv('TAROT_DB_PASSWORD') ?: 'change-this-password',
    ],
    'openai' => [
        'api_key' => getenv('OPENAI_API_KEY') ?: '',
        'model' => getenv('OPENAI_MODEL') ?: '',
        'use_card_images' => filter_var(getenv('AI_USE_CARD_IMAGES') ?: '0', FILTER_VALIDATE_BOOLEAN),
    ],
    'security' => [
        'session_name' => 'tarot_fortune_session',
        'beta_per_minute' => 6,
        'beta_per_hour' => 60,
        'login_per_minute' => 10,
    ],
];

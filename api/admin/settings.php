<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';

function save_openai_settings(array $data): string
{
    $key = trim((string)($data['openai_api_key'] ?? ''));
    $model = trim((string)($data['openai_model'] ?? ''));
    $current = app_config()['openai'] ?? [];
    if ($key === '') {
        $key = trim((string)($current['api_key'] ?? ''));
    }
    if ($key === '' || $model === '') {
        throw new TarotApiException('กรุณาใส่ API key และ model ให้ครบ', 422, 'OPENAI_SETTINGS_INCOMPLETE');
    }
    if (strlen($key) < 20) {
        throw new TarotApiException('API key ดูสั้นผิดปกติ กรุณาตรวจสอบอีกครั้ง', 422, 'INVALID_OPENAI_KEY');
    }

    $configPath = app_root() . '/api/config/config.local.php';
    $directory = dirname($configPath);
    $temporary = tempnam($directory, 'tarot-config-');
    if ($temporary === false) {
        throw new TarotApiException('ไม่สามารถเตรียมไฟล์ตั้งค่าได้', 500, 'CONFIG_WRITE_FAILED');
    }
    $localConfig = [];
    if (is_file($configPath)) {
        $existing = require $configPath;
        if (is_array($existing)) {
            $localConfig = $existing;
        }
    }
    $localConfig['openai'] = [
        'api_key' => $key,
        'model' => $model,
        'use_card_images' => !empty($data['use_card_images']),
    ];
    $contents = "<?php\n\ndeclare(strict_types=1);\n\nreturn " . var_export($localConfig, true) . ";\n";
    if (file_put_contents($temporary, $contents, LOCK_EX) === false) {
        @unlink($temporary);
        throw new TarotApiException('บันทึกการตั้งค่าไม่สำเร็จ', 500, 'CONFIG_WRITE_FAILED');
    }
    @chmod($temporary, 0600);
    if (!rename($temporary, $configPath)) {
        @unlink($temporary);
        throw new TarotApiException('บันทึกการตั้งค่าไม่สำเร็จ', 500, 'CONFIG_WRITE_FAILED');
    }
    return $model;
}

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? '');
    require_admin_user();
    if ($method === 'GET') {
        success_response([
            'configured' => ai_is_configured(),
            'model' => (string)(app_config()['openai']['model'] ?? ''),
        ]);
    }
    if ($method !== 'POST') {
        throw new TarotApiException('ไม่รองรับวิธีเรียกใช้งานนี้', 405, 'METHOD_NOT_ALLOWED');
    }
    $data = request_json();
    require_csrf($data);
    $savedModel = save_openai_settings($data);
    success_response([
        'configured' => true,
        'model' => $savedModel,
    ]);
} catch (Throwable $exception) {
    handle_api_exception($exception);
}

<?php

declare(strict_types=1);

final class TarotApiException extends RuntimeException
{
    public int $status;
    public string $errorCode;

    public function __construct(string $message, int $status = 400, string $errorCode = 'REQUEST_FAILED', ?Throwable $previous = null)
    {
        $this->status = $status;
        $this->errorCode = $errorCode;
        parent::__construct($message, 0, $previous);
    }
}

function app_root(): string
{
    return dirname(__DIR__, 2);
}

function app_default_config(): array
{
    return [
        'app' => [
            'timezone' => 'Asia/Bangkok',
            'log_ai_content' => false,
            'cards_file' => app_root() . '/data/cards.json',
        ],
        'db' => [
            'dsn' => getenv('TAROT_DB_DSN') ?: '',
            'username' => getenv('TAROT_DB_USER') ?: '',
            'password' => getenv('TAROT_DB_PASSWORD') ?: '',
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
}

function app_config(): array
{
    static $config;
    if (is_array($config)) {
        return $config;
    }

    $config = app_default_config();
    foreach ([app_root() . '/api/config/config.php', app_root() . '/api/config/config.local.php'] as $file) {
        if (!is_file($file)) {
            continue;
        }
        $loaded = require $file;
        if (is_array($loaded)) {
            $config = array_replace_recursive($config, $loaded);
        }
    }

    return $config;
}

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function success_response(array $payload = []): void
{
    json_response(array_merge(['ok' => true], $payload));
}

function fail_response(string $message, int $status = 400, string $code = 'REQUEST_FAILED'): void
{
    json_response(['ok' => false, 'error' => $code, 'code' => $code, 'message' => $message], $status);
}

function handle_api_exception(Throwable $exception): void
{
    if ($exception instanceof TarotApiException) {
        fail_response($exception->getMessage(), $exception->status, $exception->errorCode);
    }

    error_log('[tarot-api] ' . $exception->getMessage());
    fail_response('ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง', 500, 'SERVER_ERROR');
}

function request_method(string $method): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== strtoupper($method)) {
        header('Allow: ' . strtoupper($method));
        throw new TarotApiException('ไม่รองรับวิธีเรียกใช้งานนี้', 405, 'METHOD_NOT_ALLOWED');
    }
}

function request_json(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    if (!is_array($data)) {
        throw new TarotApiException('รูปแบบข้อมูลไม่ถูกต้อง', 400, 'INVALID_JSON');
    }
    return $data;
}

function request_string(array $data, string $key, int $maxLength = 255): string
{
    $value = trim((string)($data[$key] ?? ''));
    if ($value === '' || function_exists('mb_strlen') && mb_strlen($value) > $maxLength) {
        throw new TarotApiException('ข้อมูลไม่ครบหรือยาวเกินกำหนด', 422, 'INVALID_INPUT');
    }
    return $value;
}

function database(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = app_config()['db'] ?? [];
    if (empty($db['dsn'])) {
        throw new TarotApiException('ยังไม่ได้ตั้งค่าฐานข้อมูลบนเซิร์ฟเวอร์', 503, 'DATABASE_NOT_CONFIGURED');
    }

    $pdo = new PDO(
        (string)$db['dsn'],
        (string)($db['username'] ?? ''),
        (string)($db['password'] ?? ''),
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ],
    );
    return $pdo;
}

function utc_now(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

function utc_sql_now(): string
{
    return utc_now()->format('Y-m-d H:i:s');
}

function start_app_session(): void
{
    if (PHP_SAPI === 'cli' || session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $security = app_config()['security'] ?? [];
    session_name((string)($security['session_name'] ?? 'tarot_fortune_session'));
    ini_set('session.use_strict_mode', '1');
    $isSecure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isSecure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return (string)$_SESSION['csrf_token'];
}

function require_csrf(array $data = []): void
{
    $provided = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($data['csrf_token'] ?? ''));
    if ($provided === '' || !hash_equals(csrf_token(), $provided)) {
        throw new TarotApiException('คำขอไม่ผ่านการตรวจสอบความปลอดภัย', 419, 'CSRF_FAILED');
    }
}

function session_rate_limit(string $bucket, int $maxAttempts, int $windowSeconds): void
{
    $now = time();
    $attempts = array_values(array_filter(
        (array)($_SESSION['rate_limits'][$bucket] ?? []),
        static fn($timestamp): bool => is_int($timestamp) && $timestamp > $now - $windowSeconds,
    ));
    if (count($attempts) >= $maxAttempts) {
        throw new TarotApiException('ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', 429, 'RATE_LIMITED');
    }
    $attempts[] = $now;
    $_SESSION['rate_limits'][$bucket] = $attempts;
}

function find_user_by_id(int $id): ?array
{
    $statement = database()->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
    $statement->execute(['id' => $id]);
    $user = $statement->fetch();
    return $user ?: null;
}

function refresh_user_status(array $user): array
{
    if (($user['role'] ?? '') === 'beta_user'
        && ($user['status'] ?? '') === 'active'
        && !empty($user['access_expires_at'])
        && strtotime((string)$user['access_expires_at'] . ' UTC') <= time()) {
        $statement = database()->prepare("UPDATE users SET status = 'expired', updated_at = UTC_TIMESTAMP() WHERE id = :id AND status = 'active'");
        $statement->execute(['id' => $user['id']]);
        $user['status'] = 'expired';
    }
    return $user;
}

function public_user(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'name' => (string)$user['name'],
        'email' => (string)$user['email'],
        'role' => (string)$user['role'],
        'status' => (string)$user['status'],
        'access_mode' => (string)$user['access_mode'],
        'access_started_at' => $user['access_started_at'],
        'access_expires_at' => $user['access_expires_at'],
        'credits' => (int)$user['credits'],
    ];
}

function current_beta_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $user = find_user_by_id((int)$_SESSION['user_id']);
    return $user ? refresh_user_status($user) : null;
}

function require_beta_user(): array
{
    $user = current_beta_user();
    if (!$user || ($user['role'] ?? '') !== 'beta_user') {
        throw new TarotApiException('กรุณาเข้าสู่ Beta Access ก่อน', 401, 'BETA_AUTH_REQUIRED');
    }
    if (($user['status'] ?? '') !== 'active') {
        $code = ($user['status'] ?? '') === 'expired' ? 'BETA_ACCESS_EXPIRED' : 'BETA_ACCESS_SUSPENDED';
        $message = $code === 'BETA_ACCESS_EXPIRED' ? 'Beta Access หมดอายุแล้ว' : 'Beta Access นี้ถูกระงับ';
        throw new TarotApiException($message, 403, $code);
    }
    if (($user['access_mode'] ?? '') !== 'beta_unlimited') {
        throw new TarotApiException('บัญชีนี้ยังไม่ได้เปิดสิทธิ์ AI Beta', 403, 'BETA_MODE_REQUIRED');
    }
    if (empty($user['access_expires_at']) || strtotime((string)$user['access_expires_at'] . ' UTC') <= time()) {
        throw new TarotApiException('Beta Access หมดอายุแล้ว', 403, 'BETA_ACCESS_EXPIRED');
    }
    return $user;
}

function require_admin_user(): array
{
    if (empty($_SESSION['admin_id'])) {
        throw new TarotApiException('กรุณาเข้าสู่ระบบแอดมิน', 401, 'ADMIN_AUTH_REQUIRED');
    }
    $user = find_user_by_id((int)$_SESSION['admin_id']);
    if (!$user || ($user['role'] ?? '') !== 'admin' || ($user['status'] ?? '') !== 'active') {
        unset($_SESSION['admin_id']);
        throw new TarotApiException('บัญชีแอดมินไม่พร้อมใช้งาน', 403, 'ADMIN_ACCESS_DENIED');
    }
    return $user;
}

function valid_card_files(mixed $cards): array
{
    if (!is_array($cards) || count($cards) < 1 || count($cards) > 3) {
        throw new TarotApiException('ต้องส่งไพ่ที่เปิด 1–3 ใบ', 422, 'INVALID_CARDS');
    }

    $valid = [];
    foreach ($cards as $card) {
        $card = basename((string)$card);
        if (!preg_match('/^card-(\d{3})\.webp$/', $card, $matches) || (int)$matches[1] < 1 || (int)$matches[1] > 78) {
            throw new TarotApiException('พบชื่อไฟล์ไพ่ที่ไม่อนุญาต', 422, 'INVALID_CARD_FILE');
        }
        $valid[] = $card;
    }
    if (count(array_unique($valid)) !== count($valid)) {
        throw new TarotApiException('ไพ่ในคำถามต้องไม่ซ้ำกัน', 422, 'DUPLICATE_CARDS');
    }
    return $valid;
}

function card_metadata(array $cardFiles): array
{
    $file = (string)(app_config()['app']['cards_file'] ?? (app_root() . '/data/cards.json'));
    if (!is_file($file)) {
        throw new TarotApiException('ยังไม่มีข้อมูลคำบนไพ่บนเซิร์ฟเวอร์', 503, 'CARD_METADATA_MISSING');
    }
    $decoded = json_decode((string)file_get_contents($file), true);
    $cards = is_array($decoded['cards'] ?? null) ? $decoded['cards'] : [];
    $byFile = [];
    foreach ($cards as $card) {
        if (is_array($card) && !empty($card['file'])) {
            $byFile[(string)$card['file']] = $card;
        }
    }

    $result = [];
    foreach ($cardFiles as $fileName) {
        if (empty($byFile[$fileName])) {
            throw new TarotApiException('ยังไม่มี metadata ของไพ่ที่เลือก', 503, 'CARD_METADATA_MISSING');
        }
        $result[] = $byFile[$fileName];
    }
    return $result;
}

function ai_is_configured(): bool
{
    $openai = app_config()['openai'] ?? [];
    return trim((string)($openai['api_key'] ?? '')) !== '' && trim((string)($openai['model'] ?? '')) !== '';
}

date_default_timezone_set((string)(app_config()['app']['timezone'] ?? 'Asia/Bangkok'));
start_app_session();

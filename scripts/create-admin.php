<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api/lib/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Run this script from the command line.\n");
    exit(1);
}

$name = trim((string)($argv[1] ?? ''));
$email = strtolower(trim((string)($argv[2] ?? '')));
$password = (string)($argv[3] ?? '');

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 10) {
    fwrite(STDERR, "Usage: php scripts/create-admin.php \"Admin Name\" admin@example.com \"strong-password\"\n");
    fwrite(STDERR, "Password must be at least 10 characters.\n");
    exit(1);
}

try {
    $statement = database()->prepare(
        "INSERT INTO users (name, email, password_hash, role, status, access_mode, credits, created_at, updated_at) VALUES (:name, :email, :password_hash, 'admin', 'active', 'beta_unlimited', 0, :created_at, :updated_at)",
    );
    $now = utc_sql_now();
    $statement->execute([
        'name' => $name,
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'created_at' => $now,
        'updated_at' => $now,
    ]);
    fwrite(STDOUT, "Admin created: {$email}\n");
} catch (Throwable $exception) {
    fwrite(STDERR, "Could not create admin: {$exception->getMessage()}\n");
    exit(1);
}

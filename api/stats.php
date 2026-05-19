<?php
/**
 * api/stats.php  —  Leaderboard endpoint voor Frans Cijfers
 *
 * GET  api/stats.php  →  {"spelling":[...top10...],"speech":[...top10...]}
 * POST api/stats.php  →  Voeg score toe / update bestaand item voor naam+modus
 *                        Body: {"name":"...","streak":5,"mode":"spelling"}
 */
declare(strict_types=1);

const STATS_FILE  = __DIR__ . '/../stats.txt';
const MAX_ENTRIES = 10;

header('Content-Type: application/json; charset=utf-8');

// ── naam-validatie ────────────────────────────────────────────────────────
function validate_name(string $name): ?string
{
    if (mb_strlen($name) < 2)  return 'Naam moet minstens 2 tekens zijn';
    if (mb_strlen($name) > 30) return 'Naam mag max. 30 tekens zijn';
    if (strpos($name, '@') !== false) return 'Geen e-mailadressen';

    // Geen emoji's of symbolen buiten Latijns + Latijns Uitgebreid (U+0000–U+024F)
    if (preg_match('/[^\x{0000}-\x{024F}\'\ \-]/u', $name)) {
        return "Geen emoji's of speciale symbolen";
    }

    // Moet beginnen én eindigen met een letter; tussenin letters, spaties, - of '
    if (!preg_match('/^\p{L}[\p{L}\' \-]*\p{L}$/u', $name)) {
        return 'Alleen letters, spaties, koppeltekens en apostrofs';
    }

    return null;
}

// ── bestands-I/O ──────────────────────────────────────────────────────────
function read_stats(): array
{
    $empty = ['spelling' => [], 'speech' => [], 'listening' => []];
    if (!file_exists(STATS_FILE)) return $empty;
    $raw = trim((string) file_get_contents(STATS_FILE));
    if ($raw === '' || $raw === 'null') return $empty;
    $data = json_decode($raw, true);
    if (!is_array($data)) return $empty;
    // Nieuw formaat heeft 'spelling' of 'speech' sleutel
    if (array_key_exists('spelling', $data) || array_key_exists('speech', $data) || array_key_exists('listening', $data)) {
        return [
            'spelling'  => (isset($data['spelling'])  && is_array($data['spelling']))  ? array_values($data['spelling'])  : [],
            'speech'    => (isset($data['speech'])    && is_array($data['speech']))    ? array_values($data['speech'])    : [],
            'listening' => (isset($data['listening']) && is_array($data['listening'])) ? array_values($data['listening']) : [],
        ];
    }
    // Oud formaat: vlakke array → migreren als spelling-scores
    return ['spelling' => array_values($data), 'speech' => [], 'listening' => []];
}

function write_stats(array $stats): void
{
    file_put_contents(
        STATS_FILE,
        json_encode($stats, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

// ── routing ───────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    echo json_encode(read_stats(), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $body = (string) file_get_contents('php://input');

    if (strlen($body) > 512) {
        http_response_code(400);
        echo json_encode(['error' => 'Payload te groot']);
        exit;
    }

    $data = json_decode($body, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'Ongeldige JSON']);
        exit;
    }

    $name   = trim((string) ($data['name']   ?? ''));
    $streak = $data['streak'] ?? null;
    $mode   = (string) ($data['mode'] ?? '');

    $err = validate_name($name);
    if ($err !== null) {
        http_response_code(400);
        echo json_encode(['error' => $err]);
        exit;
    }

    if (!is_int($streak) || $streak < 1 || $streak > 1000) {
        http_response_code(400);
        echo json_encode(['error' => 'Ongeldig resultaat']);
        exit;
    }

    if ($mode !== 'spelling' && $mode !== 'speech' && $mode !== 'listening') {
        http_response_code(400);
        echo json_encode(['error' => 'Ongeldige modus']);
        exit;
    }

    $stats = read_stats();

    // Verwijder bestaand item voor deze naam in deze modus (update, geen duplicaat)
    $stats[$mode] = array_values(array_filter(
        $stats[$mode],
        function ($e) use ($name) { return $e['name'] !== $name; }
    ));

    $stats[$mode][] = [
        'name'   => $name,
        'streak' => $streak,
        'date'   => date('Y-m-d'),
    ];

    usort($stats[$mode], function ($a, $b) { return $b['streak'] - $a['streak']; });
    $stats[$mode] = array_slice($stats[$mode], 0, MAX_ENTRIES);

    write_stats($stats);
    echo json_encode($stats, JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

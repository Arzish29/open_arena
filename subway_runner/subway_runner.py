import random
import time
from pathlib import Path

import cv2
import pygame
from ultralytics import YOLO

# ================= CONFIGURATION =================

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "best.pt"

WIDTH, HEIGHT = 900, 650
FPS = 60

LANES = [WIDTH // 2 - 150, WIDTH // 2, WIDTH // 2 + 150]
PLAYER_Y = HEIGHT - 115

CONFIDENCE = 0.25
GESTURE_COOLDOWN = 0.45
INFERENCE_INTERVAL = 0.07
OBSTACLE_INTERVAL = 0.95

CLASS_TO_ACTION = {
    "point-left": "LEFT",
    "point-right": "RIGHT",
    "point-up": "JUMP",
    "point-down": "SLIDE",
}

# =================================================

pygame.init()

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("AI Arcade - Subway Runner")

clock = pygame.time.Clock()

font = pygame.font.SysFont("arial", 25, bold=True)
small_font = pygame.font.SysFont("arial", 16)
big_font = pygame.font.SysFont("arial", 48, bold=True)

WHITE = (245, 248, 255)
DARK = (18, 24, 43)
BLUE = (45, 140, 255)
CYAN = (55, 230, 230)
RED = (245, 70, 90)
YELLOW = (255, 200, 65)
GREY = (100, 115, 140)


def normalize_class(name):
    return name.lower().replace("_", "-").strip()


def draw_text(text, x, y, color=WHITE, font_obj=font):
    surface = font_obj.render(str(text), True, color)
    screen.blit(surface, (x, y))


def new_obstacle():
    return {
        "lane": random.randrange(3),
        "y": -80,
        "kind": random.choice(["barrier", "train", "overhead"]),
        "height": random.randint(48, 68),
    }


class SubwayRunner:
    def __init__(self):
        self.reset()

    def reset(self):
        self.lane = 1
        self.obstacles = []
        self.score = 0
        self.speed = 290.0
        self.spawn_timer = 0.0
        self.jump_timer = 0.0
        self.slide_timer = 0.0
        self.game_over = False

    def move_left(self):
        if not self.game_over:
            self.lane = max(0, self.lane - 1)

    def move_right(self):
        if not self.game_over:
            self.lane = min(2, self.lane + 1)

    def jump(self):
        if not self.game_over and self.jump_timer <= 0:
            self.jump_timer = 0.75
            self.slide_timer = 0

    def slide(self):
        if not self.game_over and self.slide_timer <= 0:
            self.slide_timer = 0.85
            self.jump_timer = 0

    def handle_action(self, action):
        if action == "LEFT":
            self.move_left()
        elif action == "RIGHT":
            self.move_right()
        elif action == "JUMP":
            self.jump()
        elif action == "SLIDE":
            self.slide()

    def update(self, dt):
        if self.game_over:
            return

        self.score += dt * 10
        self.speed = min(470, 290 + self.score * 0.25)

        self.jump_timer = max(0, self.jump_timer - dt)
        self.slide_timer = max(0, self.slide_timer - dt)

        self.spawn_timer += dt

        if self.spawn_timer >= OBSTACLE_INTERVAL:
            self.obstacles.append(new_obstacle())
            self.spawn_timer = 0

        for obstacle in self.obstacles:
            obstacle["y"] += self.speed * dt

        self.obstacles = [
            ob for ob in self.obstacles
            if ob["y"] < HEIGHT + 100
        ]

        # Collision detection
        for obstacle in self.obstacles:
            if obstacle["lane"] != self.lane:
                continue

            if abs(obstacle["y"] - PLAYER_Y) >= 43:
                continue

            if obstacle["kind"] == "train":
                self.game_over = True

            elif obstacle["kind"] == "barrier":
                if self.jump_timer <= 0:
                    self.game_over = True

            elif obstacle["kind"] == "overhead":
                if self.slide_timer <= 0:
                    self.game_over = True

    def draw(self):
        screen.fill(DARK)

        # Background buildings
        for i in range(12):
            x = i * 82
            h = 70 + (i * 29) % 100

            pygame.draw.rect(
                screen, (29, 39, 64),
                (x, 200 - h // 3, 58, h + 100)
            )

        # Track
        pygame.draw.polygon(
            screen, (43, 51, 70),
            [
                (WIDTH // 2 - 80, 120),
                (WIDTH // 2 + 80, 120),
                (WIDTH - 45, HEIGHT),
                (45, HEIGHT),
            ],
        )

        # Lane dividers
        for divider_x in [WIDTH // 2 - 90, WIDTH // 2 + 90]:
            pygame.draw.line(
                screen, GREY,
                (WIDTH // 2 + (divider_x - WIDTH // 2) // 2, 120),
                (divider_x, HEIGHT),
                3,
            )

        # Track markings
        offset = int(self.score * 5) % 90

        for y in range(145 + offset, HEIGHT, 90):
            pygame.draw.line(
                screen, (90, 105, 130),
                (WIDTH // 2 - 60, y),
                (WIDTH // 2 + 60, y),
                2,
            )

        # Obstacles
        for obstacle in self.obstacles:
            x = LANES[obstacle["lane"]]
            y = int(obstacle["y"])

            if obstacle["kind"] == "train":
                pygame.draw.rect(
                    screen, BLUE,
                    (x - 42, y - 55, 84, 90),
                    border_radius=10,
                )
                pygame.draw.rect(
                    screen, CYAN,
                    (x - 27, y - 43, 54, 24),
                    border_radius=5,
                )

            elif obstacle["kind"] == "barrier":
                pygame.draw.rect(
                    screen, RED,
                    (x - 38, y - 25, 76, obstacle["height"]),
                    border_radius=7,
                )
                pygame.draw.rect(
                    screen, YELLOW,
                    (x - 28, y - 15, 56, 8),
                )

            elif obstacle["kind"] == "overhead":
                pygame.draw.rect(
                    screen, YELLOW,
                    (x - 44, y - 30, 88, 20),
                    border_radius=5,
                )
                pygame.draw.rect(
                    screen, RED,
                    (x - 36, y - 10, 8, 24),
                )
                pygame.draw.rect(
                    screen, RED,
                    (x + 28, y - 10, 8, 24),
                )

        # Player
        player_x = LANES[self.lane]
        jump_height = 95 if self.jump_timer > 0 else 0
        player_y = PLAYER_Y - jump_height

        pygame.draw.ellipse(
            screen, (10, 12, 25),
            (player_x - 33, PLAYER_Y + 18, 66, 17),
        )

        if self.slide_timer > 0:
            pygame.draw.rect(
                screen, CYAN,
                (player_x - 32, player_y + 5, 64, 25),
                border_radius=10,
            )
            pygame.draw.circle(
                screen, WHITE,
                (player_x + 25, player_y + 5), 12,
            )
        else:
            pygame.draw.rect(
                screen, CYAN,
                (player_x - 23, player_y - 35, 46, 65),
                border_radius=12,
            )
            pygame.draw.circle(
                screen, WHITE,
                (player_x, player_y - 47), 17,
            )

        # Score panel
        pygame.draw.rect(
            screen, (26, 35, 57),
            (15, 15, 240, 86),
            border_radius=12,
        )

        draw_text("SUBWAY RUNNER", 28, 24, CYAN)
        draw_text(f"Score: {int(self.score)}", 28, 59)

        draw_text(
            "Left/Right: Move | Up: Jump | Down: Slide | R: Restart | Q: Quit",
            65, HEIGHT - 30, WHITE, small_font,
        )

        if self.game_over:
            overlay = pygame.Surface(
                (WIDTH, HEIGHT), pygame.SRCALPHA
            )
            overlay.fill((0, 0, 0, 175))
            screen.blit(overlay, (0, 0))

            title = big_font.render("GAME OVER", True, RED)
            screen.blit(
                title,
                title.get_rect(
                    center=(WIDTH // 2, HEIGHT // 2 - 45)
                ),
            )

            draw_text(
                f"Final score: {int(self.score)}",
                WIDTH // 2 - 95, HEIGHT // 2 + 5,
            )

            draw_text(
                "Press R to play again",
                WIDTH // 2 - 110, HEIGHT // 2 + 45,
                CYAN, small_font,
            )


# ================= MODEL AND CAMERA =================

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Model not found: {MODEL_PATH}\n"
        "Put your trained best.pt in the models folder."
    )

model = YOLO(str(MODEL_PATH))
print("Loaded model classes:", model.names)

available_classes = {
    normalize_class(name)
    for name in model.names.values()
}

for gesture in CLASS_TO_ACTION:
    if gesture not in available_classes:
        print(f"WARNING: Gesture class missing from model: {gesture}")

camera = cv2.VideoCapture(0)

if not camera.isOpened():
    pygame.quit()
    raise RuntimeError(
        "Cannot open webcam. Close other camera apps and check permissions."
    )

camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

game = SubwayRunner()

last_inference = 0.0
last_action_time = 0.0
last_seen_time = 0.0

candidate_gesture = None
stable_count = 0
last_triggered_gesture = None

# ====================================================

running = True

try:
    while running:
        dt = min(clock.tick(FPS) / 1000.0, 0.05)
        now = time.monotonic()

        # Keyboard controls
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_q:
                    running = False
                elif event.key == pygame.K_LEFT:
                    game.move_left()
                elif event.key == pygame.K_RIGHT:
                    game.move_right()
                elif event.key == pygame.K_UP:
                    game.jump()
                elif event.key == pygame.K_DOWN:
                    game.slide()
                elif event.key == pygame.K_r:
                    game.reset()

        # Webcam
        ok, frame = camera.read()

        if ok:
            frame = cv2.flip(frame, 1)

            if now - last_inference >= INFERENCE_INTERVAL:
                last_inference = now

                results = model.predict(
                    source=frame,
                    conf=CONFIDENCE,
                    imgsz=640,
                    verbose=False,
                )

                result = results[0]
                detected = None
                highest_confidence = 0.0

                if result.boxes is not None:
                    for box in result.boxes:
                        class_id = int(box.cls.item())
                        confidence = float(box.conf.item())
                        class_name = normalize_class(
                            model.names[class_id]
                        )

                        if (
                            class_name in CLASS_TO_ACTION
                            and confidence > highest_confidence
                        ):
                            detected = class_name
                            highest_confidence = confidence

                if detected is not None:
                    last_seen_time = now

                    if detected == candidate_gesture:
                        stable_count += 1
                    else:
                        candidate_gesture = detected
                        stable_count = 1

                    if (
                        stable_count >= 2
                        and detected != last_triggered_gesture
                        and now - last_action_time >= GESTURE_COOLDOWN
                    ):
                        action = CLASS_TO_ACTION[detected]
                        game.handle_action(action)

                        last_triggered_gesture = detected
                        last_action_time = now

                        print(
                            f"{detected} -> {action} "
                            f"({highest_confidence:.2f})"
                        )

                else:
                    candidate_gesture = None
                    stable_count = 0

            # Re-arm after the gesture disappears.
            if now - last_seen_time > 0.45:
                last_triggered_gesture = None

            label = candidate_gesture or "No gesture"

            cv2.putText(
                frame,
                f"Gesture: {label}",
                (15, 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 255),
                2,
            )

            cv2.imshow("AI Arcade - Gesture Camera", frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                running = False

        game.update(dt)
        game.draw()
        pygame.display.flip()

finally:
    camera.release()
    cv2.destroyAllWindows()
    pygame.quit()
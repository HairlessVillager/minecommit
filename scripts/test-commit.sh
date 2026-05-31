rm -rf /tmp/minecommit.git && git init --bare /tmp/minecommit.git
cargo run -r --bin minecommit -- commit "/home/hlsvillager/.config/hmcl/.minecraft/versions/Fabulously-Optimized-1.21.11/saves/test42" /tmp/minecommit.git -b main --init -m "initial" --repack -p session.lock
cargo run -r --bin minecommit -- commit "/home/hlsvillager/.config/hmcl/.minecraft/versions/Fabulously-Optimized-1.21.11/saves/test42-new" /tmp/minecommit.git -b main -m "2" --repack -p session.lock

# rm -rf /tmp/minecommit.git && git init --bare /tmp/minecommit.git
# cargo run -r --bin minecommit -- commit "/home/hlsvillager/Desktop/test-saves/VanillaEra-2/2026-05-17_17-46-25/world" /tmp/minecommit.git -b main --init -m "initial" --repack -p "SDMEconomy/*.data" -p "playerdata/*.cosarmor"
# cargo run -r --bin minecommit -- commit "/home/hlsvillager/Desktop/test-saves/VanillaEra-2/2026-05-17_19-46-25/world" /tmp/minecommit.git -b main -m "2" --repack -p "SDMEconomy/*.data" -p "playerdata/*.cosarmor"

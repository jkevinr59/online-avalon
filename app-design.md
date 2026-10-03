App design:

1. Architecture: 
    - server using quick node.js for backend
    - client using React for frontend
    - database using sqlite3
2. User:
    - Player
    - Host
3. Usecase:
    - Player:
        + Player identify themselves with name
        + Player getting a randomized role
        + Player knows all player on their list
        + Player with Evil role knows their teammate
        + Player with Merlin role knows who is Evil player
        + Player as leader can propose team
        + Player can votes to approve or reject team proposed by current leader
        + Player can votes to success the quest
        + Evil Player can votes to fail the quest
        + Evil Player can select who is player with Merlin if they are failed to win by normal circumstances
    - Host:
        + Host able to know who is joining
        + Host is able to join the game too if needed
        + Host can start the game
        + Host can finish the game abruptly if needed
4. System Design:
    - System is designed by Avalon Rules Guide but using basic role as good, evil and merlin
    - Player is login to app by inputing name and hardcoded password,
    - Host will login with /host route
    - setting data will be stored within database, as rule for each player count needed
    - UI need to be simple but have a good clarity on what each player know, app dont need any fancy image, just a good button design

module.exports = {

    apps: [

      {

        name: "solar-pump",

        script: "server.js",

        exec_mode: "fork", 

        autorestart: true, 

        max_restarts: 10, 

        restart_delay: 5000

      }

    ]

  };

  

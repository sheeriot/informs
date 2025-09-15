workspace "Intaker" "A Django (python) web application for form data collection and curation " {

    !identifiers hierarchical
    # !docs readme

    model {

        components_title = element "Informs Components" "" "" componentstitletag

        groundops = element "GroundOps" "" "" groundopstag {
            # intaker -> groundops
        }

        email_service = softwareSystem "Email" "Azure Communications Service" emailservice_tag {
            email2groundops = this -> groundops notify "" email2groundopstag
        }
        takserver = softwareSystem "TAK Server" "Team Awareness Kit" takservertag {
            events = container "events"
        }

        tak_client = softwareSystem "Mobile TAK" "" takclienttag {
             groundops -> this "uses"
             takserver -> this "COT"
        }

        azure_maps = softwareSystem "Azure Maps" "" azuremapstag

        informs = softwareSystem "InForms" "Web App" informstag {
            forms = container "Aid Requests" "" "intake forms" intakeformstag {
                groundops -> this "updates" "" groundops2forms
            }
            db = container "Informs Database" "" "" informsdbtag

            curate = container "Curation" "" "Business Logic" informscuratetag {
                -> forms
            }

            tasks = container "Tasks" "" "" informstaskstag {
                this -> email_service NOTIFY
                this -> azure_maps geocode "maps"
                forms -> this
            }
            pytak = container "PyTAK" "" "" informspytaktag {
                -> takserver "COT" "" pytak2takservertag
                tasks -> this "ALERT!"
            }
        }

        dispatchops = element "DispatchOps" "" "" dispatchopstag {
            -> informs.forms "admin" "" dispatch2intakeformstag
            -> informs.curate "curate" "" dispatch2intakecuratetag
            email2dispatch = email_service -> this notify
        }
    }
    views {

        systemContext informs "InFormsCustomApp" "" {
            include *
            include groundops
            include tak_client
            title "Informs Web App - Software Systems"

        }

        # container <software system identifier> [key] [description] {
        #     ...
        # }
        container informs informsview "InForms - Custom Web App" {
            include *
            include groundops
            include dispatchops
            include tak_client

            exclude email2dispatch
            exclude email2groundops

            include components_title
            # autolayout lr
        }

        styles {
            relationship "Relationship" {
                # color green
                dashed false
                fontSize 36
                thickness 3
            }

            element azuremapstag {
                shape ellipse
                background lightblue
                color black
                fontSize 18
                icon icons/map_icon.png
                height 200
                width 300
            }
            element takservertag {
                shape ellipse
                background #fcc5c5
                color black
                fontSize 18
                icon icons/tak_gov.png
                height 200
                width 300
            }
            element emailservice_tag {
                shape ellipse
                background #c5f1fc
                color black
                fontSize 18
                icon icons/email_icon.png
                height 200
                width 300
            }
            element dispatchopstag {
                shape person
                #background #8FBC8F
                background #ebfcc5
                icon icons/mic-fill-red.png
                height 200
                width 300
            }
            element groundopstag {
                shape person
                # background #DAA520
                background #fce8c5
                icon icons/life-preserver_red.png
                height 200
                width 300
            }
            element informstag {
                # background #0a1856
                background #fcfac5
                # background blue
                color black
                shape RoundedBox
                icon icons/informs_icon.png
                stroke black
                # border solid
            }
            element intakeformstag {
                # background #0a1856
                background #fcc5f9
                color black
                shape cylinder
                icon icons/informs_icon.png
                width 300
                height 200
            }
            element informsdbtag {
                # background lightgreen
                background #c5fcc7
                color black
                shape Cylinder
                width 300
                height 200
                fontSize 16
            }
            element informscuratetag {
                # background yellow
                background #fcfac5
                color black
                shape hexagon
                width 300
                icon icons/content-curation.png
            }
            element informsdispatchtag {
                # background lightcoral
                background #fcc5c5
                color black
                shape roundedbox
                height 200
                width 300
            }
            element informstaskstag {
                background #b0c4de
                icon "icons/spade.png"
                color black
                shape pipe
                height 200
                width 300
            }
            element informspytaktag {
                background #fcc5df
                color black
                shape component
                height 100
                width 150
                fontSize 14
            }
            element takclienttag {
                shape roundedbox
                background #c4d7fc
                icon "icons/tak_gov.png"
                color black
                width 150
                height 200
            }
            element componentstitletag {
                shape RoundedBox
                height 100
                width 600
            }
        }
    }
}
